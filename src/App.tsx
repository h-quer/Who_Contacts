import React, { useState, useEffect } from 'react';
import { Search, User, Phone, Mail, MapPin, Briefcase, Plus, Save, X, Edit2, AlertCircle, Users, Layers, PlusCircle, Tag, Cake, Heart, MessageSquare, Globe, Clock, Map, Award, UserCheck, FileText, Link, Link2, Book, Trash2, Info, LogOut, Lock, Upload, Download, Star, Menu, ChevronLeft, ListChecks } from 'lucide-react';
import { cn } from './lib/utils';
import axios from 'axios';

type Theme = 'system' | 'light' | 'dark';

interface Contact {
  id: string;
  etag: string;
  addressBook: string;
  vcard: string;
  parsed: any;
}

export default function App() {
  const [credentials, setCredentials] = useState<{username: string, password: string} | null>(null);
  const [isCookieAuth, setIsCookieAuth] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [theme, setTheme] = useState<Theme>('system');
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [availableAddressBooks, setAvailableAddressBooks] = useState<{url: string, displayName: string}[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [selectedAddressBook, setSelectedAddressBook] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [filter, setFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [bulkEditField, setBulkEditField] = useState<string>('org');
  const [bulkEditData, setBulkEditData] = useState<any>({ org: [] });
  const [bulkEditAction, setBulkEditAction] = useState<'replace' | 'append'>('replace');
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Load config and initial theme
  useEffect(() => {
    axios.get('/api/config').then(res => {
      const t = res.data.colorScheme as Theme || 'system';
      setTheme(t);
      applyTheme(t);
    }).catch(err => console.error("Failed to load config", err));
    
    // Attempt to fetch contacts on load (will succeed if cookie is valid)
    fetchContacts(undefined, true);
  }, []);

  useEffect(() => {
    if (credentials) {
      fetchContacts();
    }
  }, [credentials]);

  const axiosInstance = React.useMemo(() => {
    if (!credentials) return axios.create();
    return axios.create({
      auth: {
        username: credentials.username,
        password: credentials.password
      }
    });
  }, [credentials]);

  const applyTheme = (t: Theme) => {
    if (t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const fetchContacts = async (newSelectedId?: string, isInitialCheck = false) => {
    if (!credentials && !isCookieAuth && !isInitialCheck) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get('/api/contacts');
      setContacts(res.data.contacts);
      setAvailableAddressBooks(res.data.addressBooks || []);
      setIsCookieAuth(true);
      if (typeof newSelectedId === 'string') {
        setSelectedContactId(newSelectedId);
      }
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 401) {
        if (credentials || isCookieAuth) {
          setError('Authentication failed. Check your credentials.');
        }
        setCredentials(null);
        setIsCookieAuth(false);
      } else if (status === 500) {
        setError('Failed to reach the server. Check your server URL configuration.');
      } else {
        setError('Failed to fetch contacts. Check the connection.');
      }
    } finally {
      setIsLoading(false);
      if (isInitialCheck) setIsInitializing(false);
    }
  };

  const selectedContact = React.useMemo(() => contacts.find(c => c.id === selectedContactId), [contacts, selectedContactId]);

  const groups = React.useMemo(() => Array.from(new Set(contacts.flatMap(c => 
    c.parsed.categories?.flatMap((cat: any) => 
      cat.value ? cat.value.split(',').map((s: string) => s.trim()).filter(Boolean) : []
    ) || []
  ))).sort(), [contacts]);

  const addressBooks = React.useMemo(() => Array.from(new Set(contacts.map(c => c.addressBook).filter(Boolean))).sort(), [contacts]);

  const handleNewContact = () => {
    setIsCreatingNew(true);
    setSelectedContactId(null);
  };

  const handleSelectContact = (id: string) => {
    setIsCreatingNew(false);
    setSelectedContactId(id);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const targetAbUrl = availableAddressBooks.find(ab => ab.displayName === selectedAddressBook || ab.url === selectedAddressBook)?.url || availableAddressBooks[0]?.url;

      const res = await axiosInstance.post('/api/contacts/import', { 
        vcardData: text,
        addressBookUrl: targetAbUrl
      });
      
      alert(`Import complete! Successfully imported ${res.data.imported} contacts. ${res.data.failed > 0 ? `Failed: ${res.data.failed}` : ''}`);
      fetchContacts();
    } catch (err: any) {
      alert('Import failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = async (type: 'all' | 'addressBook' | 'selected' | 'group' | 'multi') => {
    setIsExporting(true);
    let targetContacts: Contact[] = [];
    if (type === 'all') {
      targetContacts = contacts;
    } else if (type === 'addressBook') {
      targetContacts = contacts.filter(c => 
        selectedAddressBook === 'all' || !selectedAddressBook ? true : c.addressBook === selectedAddressBook
      );
    } else if (type === 'selected') {
      const selected = contacts.find(c => c.id === selectedContactId);
      if (selected) targetContacts = [selected];
    } else if (type === 'group') {
      targetContacts = contacts.filter(c => {
        if (selectedGroupId === 'all') return true;
        if (selectedGroupId === 'ungrouped') {
          const allGroups = c.parsed.categories?.flatMap((cat: any) => 
            cat.value ? cat.value.split(',').map((s: string) => s.trim()).filter(Boolean) : []
          ) || [];
          return allGroups.length === 0;
        } else {
          const contactGroups = c.parsed.categories?.flatMap((cat: any) => 
            cat.value ? cat.value.split(',').map((s: string) => s.trim()).filter(Boolean) : []
          ) || [];
          return contactGroups.includes(selectedGroupId);
        }
      });
    } else if (type === 'multi') {
      targetContacts = contacts.filter(c => selectedContactIds.includes(c.id));
    }
    
    if (targetContacts.length === 0) {
      alert("No contacts to export");
      setIsExporting(false);
      setIsExportModalOpen(false);
      return;
    }
    
    try {
      const res = await axiosInstance.post('/api/export', { contacts: targetContacts }, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', type === 'selected' ? 'contact.vcf' : 'contacts.vcf');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed", err);
      alert("Export failed");
    } finally {
      setIsExporting(false);
      setIsExportModalOpen(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedContactIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to strictly DELETE ${selectedContactIds.length} contacts? This cannot be undone.`)) return;

    setIsBulkProcessing(true);
    const selectedContacts = contacts
      .filter(c => selectedContactIds.includes(c.id))
      .map(c => ({ id: c.id, etag: c.etag }));
    
    try {
      const res = await axiosInstance.post('/api/contacts/bulk-delete', { 
        contactsToDelete: selectedContacts 
      });
      
      const { deleted, failed } = res.data;
      alert(`Successfully deleted ${deleted} out of ${selectedContactIds.length} contacts.${failed > 0 ? ` Failed: ${failed}` : ''}`);
    } catch (e: any) {
      console.error("Bulk delete failed", e);
      alert(`Bulk delete failed: ${e.response?.data?.error || e.message}`);
    } finally {
      setIsBulkProcessing(false);
      setSelectedContactIds([]);
      setIsMultiSelectMode(false);
      fetchContacts();
      
      if (selectedContactId && selectedContactIds.includes(selectedContactId)) {
         setSelectedContactId(null);
      }
    }
  };

  const handleBulkEditSave = async () => {
    if (selectedContactIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to overwrite '${bulkEditField}' for ${selectedContactIds.length} contacts?`)) return;

    setIsBulkProcessing(true);
    let successCount = 0;
    
    const selectedContacts = contacts.filter(c => selectedContactIds.includes(c.id));
    
    for (const contact of selectedContacts) {
         try {
             const newParsedData = JSON.parse(JSON.stringify(contact.parsed));
             
             if (bulkEditAction === 'replace') {
                 newParsedData[bulkEditField] = bulkEditData[bulkEditField] || [];
             } else {
                 if (!newParsedData[bulkEditField]) newParsedData[bulkEditField] = [];
                 newParsedData[bulkEditField] = [...newParsedData[bulkEditField], ...(bulkEditData[bulkEditField] || [])];
             }
             
             await axiosInstance.put('/api/contacts', {
                 id: contact.id,
                 etag: contact.etag,
                 parsedData: newParsedData
             });
             successCount++;
         } catch (e) {
             console.error("Failed to update contact in bulk loop", contact.id, e);
         }
    }
    
    setIsBulkProcessing(false);
    setIsBulkEditModalOpen(false);
    setSelectedContactIds([]);
    setIsMultiSelectMode(false);
    alert(`Successfully updated ${successCount} out of ${selectedContactIds.length} contacts.`);
    fetchContacts();
  };

  const updateBulkField = (key: string, index: number, field: string, value: string) => {
    const newData = { ...bulkEditData };
    if (!newData[key]) newData[key] = [];
    if (!newData[key][index]) newData[key][index] = { value: '', type: '', pref: '' };
    newData[key][index][field] = value;
    setBulkEditData(newData);
  };

  const addBulkField = (key: string) => {
    setBulkEditData({ ...bulkEditData, [key]: [...(bulkEditData[key] || []), { value: '', type: '', pref: '' }] });
  };

  const removeBulkField = (key: string, index: number) => {
    const arr = [...(bulkEditData[key] || [])];
    arr.splice(index, 1);
    setBulkEditData({ ...bulkEditData, [key]: arr });
  };

  const BULK_EDITABLE_FIELDS = [
      { id: 'org', label: 'Organization (org)', icon: <Briefcase className="w-5 h-5 text-tardis" /> },
      { id: 'title', label: 'Title', icon: <Award className="w-5 h-5 text-tardis" /> },
      { id: 'role', label: 'Role', icon: <UserCheck className="w-5 h-5 text-tardis" /> },
      { id: 'categories', label: 'Categories / Tags', icon: <Tag className="w-5 h-5 text-tardis" /> },
      { id: 'tel', label: 'Phone', icon: <Phone className="w-5 h-5 text-tardis" />, props: { hasType: true, hasPref: true } },
      { id: 'email', label: 'Email', icon: <Mail className="w-5 h-5 text-tardis" />, props: { hasType: true, hasPref: true } },
      { id: 'adr', label: 'Address', icon: <MapPin className="w-5 h-5 text-tardis" />, props: { hasType: true, hasPref: true, isAddress: true } },
      { id: 'url', label: 'Website', icon: <Link className="w-5 h-5 text-tardis" />, props: { hasType: true, hasPref: true } },
      { id: 'note', label: 'Notes', icon: <FileText className="w-5 h-5 text-tardis" /> },
      { id: 'impp', label: 'Instant Messaging', icon: <MessageSquare className="w-5 h-5 text-tardis" />, props: { hasType: true, hasPref: true } }
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg-color)] text-[var(--text-color)] transition-colors duration-200">
      {/* Header */}
      <header className="flex items-center justify-between px-4 md:px-6 py-4 bg-tardis text-white shadow-md z-20 relative">
        <div className="flex items-center space-x-3">
          <button 
            className="md:hidden p-1 mr-1 focus:outline-none"
            onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center">
            <img src="/who.png" alt="Who Contacts Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-wider hidden sm:block">Who Contacts</h1>
        </div>
        <div className="flex items-center space-x-2">
          
          <button 
            onClick={() => {
              setIsMultiSelectMode(!isMultiSelectMode);
              if (isMultiSelectMode) setSelectedContactIds([]);
            }}
            className={cn("p-2 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-dalek", isMultiSelectMode ? "bg-white text-tardis hover:bg-gray-100" : "hover:bg-tardis-light")}
            title="Select multiple"
          >
            <ListChecks className="w-6 h-6" />
          </button>
          
          <input 
            type="file"  
            accept=".vcf,.vcard" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
          />
          <button 
            onClick={handleImportClick}
            disabled={isImporting}
            className="p-2 rounded-full hover:bg-tardis-light transition-colors focus:outline-none focus:ring-2 focus:ring-dalek disabled:opacity-50"
            title="Import vCard"
          >
            {isImporting ? (
              <div className="w-6 h-6 border-2 border-dalek border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-6 h-6 text-dalek" />
            )}
          </button>

          <button 
            onClick={() => setIsExportModalOpen(true)}
            className="p-2 rounded-full hover:bg-tardis-light transition-colors focus:outline-none focus:ring-2 focus:ring-dalek"
            title="Export vCard"
          >
            <Download className="w-6 h-6 text-dalek" />
          </button>

          <button 
            onClick={() => setIsAboutOpen(true)}
            className="p-2 rounded-full hover:bg-tardis-light transition-colors focus:outline-none focus:ring-2 focus:ring-dalek"
            title="About Who Contacts"
          >
            <Info className="w-6 h-6 text-dalek" />
          </button>

          <button 
            onClick={async () => {
              try { await axios.post('/api/logout'); } catch (e) {}
              setCredentials(null);
              setIsCookieAuth(false);
              setContacts([]);
              setSelectedContactId(null);
              setIsCreatingNew(false);
            }}
            className="p-2 rounded-full hover:bg-tardis-light transition-colors focus:outline-none focus:ring-2 focus:ring-dalek"
            title="Logout"
          >
            <LogOut className="w-6 h-6 text-dalek" />
          </button>
        </div>
      </header>

      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg p-6 max-w-sm w-full shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2 text-[var(--text-color)]">
                <Download className="w-5 h-5 text-tardis" />
                Export vCard
              </h2>
              <button 
                onClick={() => setIsExportModalOpen(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                disabled={isExporting}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex flex-col space-y-3">
              {isMultiSelectMode && selectedContactIds.length > 0 && (
                <button
                  onClick={() => handleExport('multi')}
                  disabled={isExporting}
                  className="w-full text-left px-4 py-3 rounded-md bg-tardis/10 hover:bg-tardis/20 text-tardis transition-colors flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed border border-tardis/30 font-medium"
                >
                  <span>Selected Multiple Contacts</span>
                  <span className="text-xs text-tardis font-bold bg-tardis/20 px-2 py-1 rounded-full">
                    {selectedContactIds.length} items
                  </span>
                </button>
              )}
            
              <button
                onClick={() => handleExport('selected')}
                disabled={!selectedContactId || isExporting}
                className="w-full text-left px-4 py-3 rounded-md bg-gray-50 dark:bg-gray-800/50 hover:bg-tardis/10 hover:text-tardis transition-colors flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed border border-[var(--border-color)]"
              >
                <span>Selected Contact</span>
                <span className="text-xs text-gray-500 font-medium bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded-full">
                  1 item
                </span>
              </button>
              
              {selectedGroupId !== 'all' && (
                <button
                  onClick={() => handleExport('group')}
                  disabled={contacts.filter(c => {
                    if (selectedGroupId === 'ungrouped') {
                      const allGroups = c.parsed.categories?.flatMap((cat: any) => 
                        cat.value ? cat.value.split(',').map((s: string) => s.trim()).filter(Boolean) : []
                      ) || [];
                      return allGroups.length === 0;
                    } else {
                      const contactGroups = c.parsed.categories?.flatMap((cat: any) => 
                        cat.value ? cat.value.split(',').map((s: string) => s.trim()).filter(Boolean) : []
                      ) || [];
                      return contactGroups.includes(selectedGroupId);
                    }
                  }).length === 0 || isExporting}
                  className="w-full text-left px-4 py-3 rounded-md bg-gray-50 dark:bg-gray-800/50 hover:bg-tardis/10 hover:text-tardis transition-colors flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed border border-[var(--border-color)]"
                >
                  <span className="truncate max-w-[200px]">This Group ({selectedGroupId === 'ungrouped' ? 'Ungrouped' : selectedGroupId})</span>
                  <span className="text-xs text-gray-500 font-medium bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded-full shrink-0">
                    {contacts.filter(c => {
                      if (selectedGroupId === 'ungrouped') {
                        const allGroups = c.parsed.categories?.flatMap((cat: any) => 
                          cat.value ? cat.value.split(',').map((s: string) => s.trim()).filter(Boolean) : []
                        ) || [];
                        return allGroups.length === 0;
                      } else {
                        const contactGroups = c.parsed.categories?.flatMap((cat: any) => 
                          cat.value ? cat.value.split(',').map((s: string) => s.trim()).filter(Boolean) : []
                        ) || [];
                        return contactGroups.includes(selectedGroupId);
                      }
                    }).length} items
                  </span>
                </button>
              )}

              <button
                onClick={() => handleExport('addressBook')}
                disabled={contacts.filter(c => selectedAddressBook === 'all' || !selectedAddressBook ? true : c.addressBook === selectedAddressBook).length === 0 || isExporting}
                className="w-full text-left px-4 py-3 rounded-md bg-gray-50 dark:bg-gray-800/50 hover:bg-tardis/10 hover:text-tardis transition-colors flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed border border-[var(--border-color)]"
              >
                <span>This Address Book</span>
                <span className="text-xs text-gray-500 font-medium bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded-full">
                  {contacts.filter(c => selectedAddressBook === 'all' || !selectedAddressBook ? true : c.addressBook === selectedAddressBook).length} items
                </span>
              </button>
              
              <button
                onClick={() => handleExport('all')}
                disabled={contacts.length === 0 || isExporting}
                className="w-full text-left px-4 py-3 rounded-md bg-gray-50 dark:bg-gray-800/50 hover:bg-tardis/10 hover:text-tardis transition-colors flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed border border-[var(--border-color)]"
              >
                <span className="font-medium text-tardis">All Contacts</span>
                <span className="text-xs text-gray-500 font-medium bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded-full">
                  {contacts.length} items
                </span>
              </button>
            </div>
            
            {isExporting && (
              <div className="mt-4 flex flex-col items-center justify-center text-sm text-tardis">
                <div className="w-5 h-5 border-2 border-tardis border-t-transparent rounded-full animate-spin mb-1" />
                Processing...
              </div>
            )}
          </div>
        </div>
      )}

      {isBulkEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg p-6 max-w-lg w-full shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2 text-[var(--text-color)]">
                <Edit2 className="w-5 h-5 text-tardis" />
                Bulk Edit ({selectedContactIds.length} contacts)
              </h2>
              <button 
                onClick={() => setIsBulkEditModalOpen(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
                disabled={isBulkProcessing}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex flex-col space-y-4 max-h-[60vh] overflow-y-auto overflow-x-hidden p-1 min-w-0">
              <div>
                <label className="block text-sm font-medium mb-1">Select Field to Edit</label>
                <select 
                  value={bulkEditField} 
                  onChange={(e) => {
                    setBulkEditField(e.target.value);
                    setBulkEditData({ [e.target.value]: [] });
                  }}
                  className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis"
                >
                  {BULK_EDITABLE_FIELDS.map(f => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Action</label>
                <select 
                  value={bulkEditAction} 
                  onChange={(e) => setBulkEditAction(e.target.value as 'replace' | 'append')}
                  className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis"
                >
                  <option value="replace">Overwrite selected field for all selected contacts</option>
                  <option value="append">Append to selected field for all selected contacts</option>
                </select>
              </div>

              <div className="border border-[var(--border-color)] rounded-lg p-4 bg-[var(--panel-bg)] min-w-0">
                {(() => {
                  const fieldDef = BULK_EDITABLE_FIELDS.find(f => f.id === bulkEditField);
                  if (!fieldDef) return null;
                  return (
                    <FieldSection 
                      icon={fieldDef.icon}
                      title={fieldDef.label}
                      fieldKey={fieldDef.id}
                      data={bulkEditData}
                      isEditing={true}
                      onUpdate={updateBulkField}
                      onAdd={addBulkField}
                      onRemove={removeBulkField}
                      {...(fieldDef.props || {})}
                    />
                  );
                })()}
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3 pt-4 border-t border-[var(--border-color)]">
              <button 
                onClick={() => setIsBulkEditModalOpen(false)}
                className="px-4 py-2 border border-[var(--border-color)] rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                disabled={isBulkProcessing}
              >
                Cancel
              </button>
              <button 
                onClick={handleBulkEditSave}
                disabled={isBulkProcessing}
                className="px-4 py-2 bg-tardis text-white font-medium rounded-md hover:bg-tardis-light transition-colors flex items-center shadow-lg"
              >
                {isBulkProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Apply to {selectedContactIds.length} Contacts
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAboutOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg p-8 max-w-md w-full shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setIsAboutOpen(false)}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 mb-6">
                <img src="/who.png" alt="Who Contacts Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Who Contacts</h2>
              <p className="text-sm text-gray-500 mb-6 italic">The Doctor's Personal Address Book</p>
              
              <div className="space-y-4 w-full text-left border-t border-[var(--border-color)] pt-6">
                <div className="flex justify-between">
                  <span className="font-bold">Version:</span>
                  <span>0.1</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">Github:</span>
                  <span className="text-gray-400 italic">(placeholder)</span>
                </div>
                <div className="text-center pt-4">
                  <a 
                    href="https://www.flaticon.com/free-icons/telephone" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-tardis hover:underline"
                  >
                    Icon created by Iconic Panda - Flaticon
                  </a>
                </div>
                <p className="text-xs text-center text-gray-400 pt-2">
                  Created using Google AI Studio
                </p>
              </div>
              
              <button 
                onClick={() => setIsAboutOpen(false)}
                className="mt-8 w-full py-2 bg-tardis text-white font-bold rounded-lg hover:bg-tardis-light transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 w-full overflow-hidden flex relative">
        {/* Leftmost Pane - Groups & New Companion */}
        {isMobileNavOpen && (
          <div className="absolute inset-0 bg-black/50 z-30 md:hidden" onClick={() => setIsMobileNavOpen(false)} />
        )}
        <div className={cn(
          "absolute md:relative z-40 h-full w-64 flex flex-col bg-[var(--panel-bg)] border-r border-[var(--border-color)] shrink-0 shadow-inner transition-transform duration-300 md:translate-x-0 hidden md:flex",
          isMobileNavOpen ? "translate-x-0 flex" : "-translate-x-full"
        )}>
          <div className="px-4 py-3 border-b border-[var(--border-color)] bg-tardis/5">
            <button 
              onClick={() => {
                handleNewContact();
                setIsMobileNavOpen(false);
              }}
              className="w-full h-10 flex items-center justify-center space-x-2 bg-dalek hover:bg-dalek-dark text-black font-bold rounded-lg transition-all shadow-md active:scale-95 border-b-4 border-dalek-dark/30"
            >
              <PlusCircle className="w-5 h-5" />
              <span>New Companion</span>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <div className="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400">Navigation</div>
            <button 
              onClick={() => {
                setSelectedGroupId('all');
                setIsMobileNavOpen(false);
              }}
              className={cn(
                "w-full flex items-center space-x-3 px-3 py-2 rounded-md transition-all duration-200",
                selectedGroupId === 'all' ? "bg-tardis text-white shadow-md translate-x-1" : "hover:bg-tardis/10 text-[var(--text-color)]"
              )}
            >
              <Users className="w-5 h-5" />
              <span className="font-medium">All Contacts</span>
            </button>
            <button 
              onClick={() => {
                setSelectedGroupId('ungrouped');
                setIsMobileNavOpen(false);
              }}
              className={cn(
                "w-full flex items-center space-x-3 px-3 py-2 rounded-md transition-all duration-200",
                selectedGroupId === 'ungrouped' ? "bg-tardis text-white shadow-md translate-x-1" : "hover:bg-tardis/10 text-[var(--text-color)]"
              )}
            >
              <Layers className="w-5 h-5" />
              <span className="font-medium">Ungrouped</span>
            </button>

            <div className="pt-4 px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400">Groups</div>
            {groups.map((group: any) => (
              <button 
                key={group}
                onClick={() => {
                  setSelectedGroupId(group);
                  setIsMobileNavOpen(false);
                }}
                className={cn(
                  "w-full flex items-center space-x-3 px-3 py-2 rounded-md transition-all duration-200",
                  selectedGroupId === group ? "bg-tardis text-white shadow-md translate-x-1" : "hover:bg-tardis/10 text-[var(--text-color)]"
                )}
              >
                <div className={cn(
                  "w-5 h-5 flex items-center justify-center font-bold text-xs rounded transition-colors",
                  selectedGroupId === group ? "bg-white/20 text-white" : "bg-tardis/20 text-tardis"
                )}>
                  {String(group).charAt(0).toUpperCase()}
                </div>
                <span className="font-medium truncate">{String(group)}</span>
              </button>
            ))}

            <div className="pt-4 px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400">Address Books</div>
            {addressBooks.map((ab: string) => (
              <button 
                key={ab}
                onClick={() => {
                  setSelectedAddressBook(prev => prev === ab ? null : ab);
                  setIsMobileNavOpen(false);
                }}
                className={cn(
                  "w-full flex items-center space-x-3 px-3 py-2 rounded-md transition-all duration-200",
                  selectedAddressBook === ab ? "bg-tardis text-white shadow-md translate-x-1" : "hover:bg-tardis/10 text-[var(--text-color)]"
                )}
              >
                <div className={cn(
                  "w-5 h-5 flex items-center justify-center rounded transition-colors",
                  selectedAddressBook === ab ? "bg-white/20 text-white" : "bg-tardis/20 text-tardis"
                )}>
                  <Book className="w-3.5 h-3.5" />
                </div>
                <span className="font-medium truncate">{ab}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Middle Pane - Contacts List */}
        <div className={cn(
          "flex flex-col bg-[var(--panel-bg)] border-r border-[var(--border-color)] shrink-0",
          (selectedContactId || isCreatingNew) ? "hidden md:flex w-80" : "flex-1 md:w-80 md:flex-none"
        )}>
          <div className="px-4 py-3 border-b border-[var(--border-color)]">
            <div className="relative h-10">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="text"
                placeholder="Search contacts..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full h-full pl-10 pr-4 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis"
              />
            </div>
            
            {isMultiSelectMode && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border-color)] animate-in fade-in slide-in-from-top-2">
                <span className="text-sm font-medium text-tardis">
                  {selectedContactIds.length} selected
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setIsBulkEditModalOpen(true)}
                    disabled={selectedContactIds.length === 0}
                    className="flex items-center px-2 py-1 text-xs font-medium text-white bg-tardis rounded hover:bg-tardis-light disabled:opacity-50 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5 mr-1" />
                    Edit
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={selectedContactIds.length === 0}
                    className="flex items-center px-2 py-1 text-xs font-medium text-white bg-dalek rounded hover:bg-dalek/90 disabled:opacity-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tardis"></div>
              </div>
            ) : error ? (
              <div className="p-4 text-red-500 text-center flex flex-col items-center">
                <AlertCircle className="w-8 h-8 mb-2" />
                <p>{error}</p>
              </div>
            ) : (
              <ContactsList 
                contacts={contacts} 
                filter={filter} 
                selectedGroupId={selectedGroupId}
                selectedAddressBook={selectedAddressBook}
                selectedId={selectedContactId}
                onSelect={handleSelectContact}
                isMultiSelectMode={isMultiSelectMode}
                selectedContactIds={selectedContactIds}
                toggleSelection={(id) => {
                   if (selectedContactIds.includes(id)) {
                       setSelectedContactIds(selectedContactIds.filter(i => i !== id));
                   } else {
                       setSelectedContactIds([...selectedContactIds, id]);
                   }
                }}
              />
            )}
          </div>
        </div>

        {/* Right Pane - Contact Details */}
        <div className={cn(
          "bg-[var(--bg-color)] overflow-y-auto relative",
          (selectedContactId || isCreatingNew) ? "flex-1 flex flex-col w-full" : "hidden md:flex md:flex-col md:flex-1 w-full"
        )}>
          {isCreatingNew ? (
            <ContactDetails 
              contact={null} 
              allContacts={contacts}
              axiosInstance={axiosInstance}
              availableAddressBooks={availableAddressBooks}
              onSave={(id) => {
                setIsCreatingNew(false);
                fetchContacts(id);
              }}
              onCancel={() => setIsCreatingNew(false)}
            />
          ) : selectedContact ? (
            <ContactDetails 
              contact={selectedContact} 
              allContacts={contacts}
              axiosInstance={axiosInstance}
              availableAddressBooks={availableAddressBooks}
              onSave={fetchContacts}
              onCancel={() => setSelectedContactId(null)}
            />
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center text-gray-500">
              <User className="w-24 h-24 mb-4 text-gray-300" />
              <p className="text-xl">Select a contact</p>
            </div>
          )}
        </div>
      </main>

      {/* Login Screen */}
      {!credentials && !isCookieAuth && (
        isInitializing ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-color)]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tardis"></div>
          </div>
        ) : (
          <LoginScreen onLogin={(user, pass) => setCredentials({username: user, password: pass})} />
        )
      )}
    </div>
  );
}

// --- Subcomponents ---

function ContactsList({ contacts, filter, selectedGroupId, selectedAddressBook, selectedId, onSelect, isMultiSelectMode, selectedContactIds, toggleSelection }: { contacts: Contact[], filter: string, selectedGroupId: string, selectedAddressBook: string | null, selectedId: string | null, onSelect: (id: string) => void, isMultiSelectMode?: boolean, selectedContactIds?: string[], toggleSelection?: (id: string) => void }) {
  // Filter contacts
  const filtered = React.useMemo(() => {
    return contacts.filter(c => {
      // Address Book filter
      if (selectedAddressBook && c.addressBook !== selectedAddressBook) return false;

      // Group filter
      if (selectedGroupId === 'ungrouped') {
        if (c.parsed.categories && c.parsed.categories.length > 0) {
          const allGroups = c.parsed.categories.flatMap((cat: any) => 
            cat.value ? cat.value.split(',').map((s: string) => s.trim()).filter(Boolean) : []
          );
          if (allGroups.length > 0) return false;
        }
      } else if (selectedGroupId !== 'all') {
        const contactGroups = c.parsed.categories?.flatMap((cat: any) => 
          cat.value ? cat.value.split(',').map((s: string) => s.trim()).filter(Boolean) : []
        ) || [];
        if (!contactGroups.includes(selectedGroupId)) return false;
      }

      // Search filter
      if (!filter) return true;
      const term = filter.toLowerCase();
      const vcardStr = c.vcard.toLowerCase();
      return vcardStr.includes(term);
    });
  }, [contacts, filter, selectedGroupId, selectedAddressBook]);

  // Group by address book (optional, maybe just list them now)
  const grouped = React.useMemo(() => {
    return filtered.reduce((acc, c) => {
      if (!acc[c.addressBook]) acc[c.addressBook] = [];
      acc[c.addressBook].push(c);
      return acc;
    }, {} as Record<string, Contact[]>);
  }, [filtered]);

  if (filtered.length === 0) {
    return <div className="p-4 text-center text-gray-500">No contacts found.</div>;
  }

  return (
    <div className="space-y-4">
      {(Object.entries(grouped) as [string, Contact[]][]).map(([group, groupContacts]) => (
        <div key={group} className="mb-6">
          <h3 className="px-3 py-1.5 text-xs font-bold text-tardis bg-tardis/10 dark:bg-tardis/20 border-l-4 border-tardis rounded-r-md mb-3">
            {group}
          </h3>
          <ul className="space-y-1">
            {groupContacts.map(c => {
              const fn = c.parsed.fn?.[0]?.value || 'Unnamed Contact';
              const photo = c.parsed.photo?.[0]?.value;
              const isBase64 = photo && (photo.startsWith('data:') || /^[A-Za-z0-9+/=]+$/.test(photo.replace(/\s/g, '')));
              const photoUrl = isBase64 && !photo.startsWith('data:') ? `data:image/jpeg;base64,${photo}` : photo;

              return (
                <li key={c.id}>
                  <button
                    onClick={() => isMultiSelectMode && toggleSelection ? toggleSelection(c.id) : onSelect(c.id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-md transition-all duration-200 flex items-center space-x-3",
                      (!isMultiSelectMode && selectedId === c.id) || (isMultiSelectMode && selectedContactIds?.includes(c.id))
                        ? "bg-tardis text-white shadow-md scale-[1.02] z-10 relative" 
                        : "hover:bg-tardis/10 text-[var(--text-color)]"
                    )}
                  >
                    {isMultiSelectMode && (
                      <div className="mr-2">
                        <input 
                          type="checkbox" 
                          checked={selectedContactIds?.includes(c.id)} 
                          readOnly 
                          className="w-4 h-4 rounded border-gray-300 text-tardis focus:ring-tardis pointer-events-none"
                        />
                      </div>
                    )}
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-base font-bold shadow-sm transition-colors overflow-hidden shrink-0",
                      (!isMultiSelectMode && selectedId === c.id) || (isMultiSelectMode && selectedContactIds?.includes(c.id)) ? "bg-white text-tardis" : "bg-tardis text-white"
                    )}>
                      {photoUrl ? (
                        <img src={photoUrl} alt={fn} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        fn.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate">{fn}</p>
                      {c.parsed.org?.[0]?.value && (
                        <p className={cn(
                          "text-xs truncate",
                          (!isMultiSelectMode && selectedId === c.id) || (isMultiSelectMode && selectedContactIds?.includes(c.id)) ? "text-white/80" : "text-gray-500"
                        )}>{c.parsed.org[0].value}</p>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ContactDetails({ contact, allContacts, axiosInstance, availableAddressBooks, onSave, onCancel }: { contact: Contact | null, allContacts: Contact[], axiosInstance: any, availableAddressBooks: {url: string, displayName: string}[], onSave: (id?: string) => void, onCancel?: () => void }) {
  const [isEditing, setIsEditing] = useState(!contact);
  const [editedData, setEditedData] = useState<any>(null);
  const [selectedAddressBookUrl, setSelectedAddressBookUrl] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [showPrefix, setShowPrefix] = useState(false);
  const [showAdditional, setShowAdditional] = useState(false);
  const [showSuffix, setShowSuffix] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setShowPrefix(false);
      setShowAdditional(false);
      setShowSuffix(false);
    }
  }, [isEditing]);

  useEffect(() => {
    if (contact) {
      setIsEditing(false);
      setEditedData(JSON.parse(JSON.stringify(contact.parsed)));
      setSelectedAddressBookUrl(contact.addressBook || '');
    } else {
      setIsEditing(true);
      setSelectedAddressBookUrl(availableAddressBooks[0]?.url || '');
      setEditedData({
        fn: [{ value: '' }],
        kind: [],
        nickname: [],
        bday: [],
        anniversary: [],
        gender: [],
        tel: [],
        email: [],
        impp: [],
        lang: [],
        tz: [],
        geo: [],
        title: [],
        role: [],
        org: [],
        adr: [],
        categories: [],
        note: [],
        url: [],
        related: []
      });
    }
    setSaveError(null);
  }, [contact]);

  const validateContact = (data: any): string | null => {
    if (!data) return null;

    if (data.email) {
      for (const item of data.email) {
        if (item.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.value)) {
          return `Invalid email format: ${item.value}`;
        }
      }
    }

    if (data.url) {
      for (const item of data.url) {
        if (item.value && !/^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i.test(item.value)) {
          return `Invalid URL format: ${item.value}. Must start with http:// or https://`;
        }
      }
    }

    if (data.impp) {
      for (const item of data.impp) {
        if (item.value && !/^[a-zA-Z0-9.+-]+:/i.test(item.value)) {
          return `Invalid Instant Messaging URI: ${item.value}. Must be a valid URI (e.g., xmpp:user@domain, skype:username)`;
        }
      }
    }

    if (data.geo) {
      for (const item of data.geo) {
        if (item.value && !/^geo:-?\d+(\.\d+)?,-?\d+(\.\d+)?(,-?\d+(\.\d+)?)?(;.*)?$/i.test(item.value)) {
          return `Invalid Geographical Coordinates: ${item.value}. Must be a geo: URI (e.g., geo:37.386,-122.083)`;
        }
      }
    }

    if (data.lang) {
      for (const item of data.lang) {
        if (item.value && !/^[a-zA-Z]{2,8}(-[a-zA-Z0-9]{2,8})*$/.test(item.value)) {
          return `Invalid Language Tag: ${item.value}. Must be an RFC 5646 tag (e.g., en, en-US)`;
        }
      }
    }

    if (data.tz) {
      for (const item of data.tz) {
        if (item.value && !/^(?:[A-Za-z_]+(?:[/-][A-Za-z_]+)*|[+-]\d{2}:?\d{2})$/.test(item.value)) {
          return `Invalid Time Zone: ${item.value}. Must be an IANA timezone (e.g., America/New_York) or UTC offset (e.g., -05:00)`;
        }
      }
    }

    if (data.gender) {
      for (const item of data.gender) {
        if (item.value && !/^[MFONU](;.*)?$/i.test(item.value)) {
          return `Invalid Gender: ${item.value}. Must be M, F, O, N, or U (vCard v4 spec).`;
        }
      }
    }

    return null;
  };

  const handleSave = async () => {
    if (!editedData.fn?.[0]?.value) {
      setSaveError('FN (Formatted Name) is required.');
      return;
    }

    const validationError = validateContact(editedData);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      let newId = contact?.id;
      if (contact) {
        // Update
        await axiosInstance.put('/api/contacts', {
          id: contact.id,
          etag: contact.etag,
          parsedData: editedData
        });
      } else {
        // Create
        const res = await axiosInstance.post('/api/contacts', {
          parsedData: editedData,
          addressBookUrl: selectedAddressBookUrl
        });
        newId = res.data.id;
      }
      
      setIsEditing(false);
      onSave(newId); // Refresh contacts
    } catch (err: any) {
      setSaveError(err.response?.data?.error || err.message || 'Failed to save contact');
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = (key: string, index: number, field: string, value: string) => {
    const newData = { ...editedData };
    if (!newData[key]) newData[key] = [];
    if (!newData[key][index]) newData[key][index] = { value: '', type: '', pref: '' };
    newData[key][index][field] = value;
    setEditedData(newData);
  };

  const handleRemoveContact = () => {
    if (!contact) return;
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!contact) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      await axiosInstance.delete('/api/contacts', {
        data: {
          id: contact.id,
          etag: contact.etag
        }
      });
      setIsDeleteModalOpen(false);
      onSave(); // Refresh list and close details
    } catch (err: any) {
      setSaveError(err.response?.data?.error || err.message || 'Failed to delete contact');
    } finally {
      setIsSaving(false);
    }
  };

  const addField = (key: string) => {
    const newData = { ...editedData };
    if (!newData[key]) newData[key] = [];
    newData[key].push({ value: '', type: '', pref: '' });
    setEditedData(newData);
  };

  const removeField = (key: string, index: number) => {
    const newData = { ...editedData };
    newData[key].splice(index, 1);
    setEditedData(newData);
  };

  const handleNameChange = (index: number, value: string) => {
    const newData = { ...editedData };
    
    let currentNValue = newData.n?.[0]?.value;
    let parts: string[] = [];
    
    if (Array.isArray(currentNValue)) {
      parts = [...currentNValue];
    } else if (typeof currentNValue === 'string') {
      parts = currentNValue.split(';');
    } else if (newData.fn?.[0]?.value) {
      const fnParts = newData.fn[0].value.split(' ');
      const lastName = fnParts.length > 1 ? fnParts.pop() || '' : '';
      const firstName = fnParts.join(' ');
      parts = [lastName, firstName, '', '', ''];
    }
    
    while (parts.length < 5) parts.push('');
    
    parts[index] = value;
    
    if (!newData.n) newData.n = [];
    if (!newData.n[0]) newData.n[0] = { value: '' };
    // Always store N as array of components
    newData.n[0].value = parts;
    
    const [family, given, additional, prefix, suffix] = parts;
    const fnPartsValid = [prefix, given, additional, family, suffix].filter(p => p && p.trim() !== '');
    const newFn = fnPartsValid.join(' ');
    
    if (!newData.fn) newData.fn = [];
    if (!newData.fn[0]) newData.fn[0] = { value: '' };
    newData.fn[0].value = newFn;
    
    setEditedData(newData);
  };

  const data = isEditing ? editedData : contact?.parsed;
  const fn = data?.fn?.[0]?.value || (contact ? 'Unnamed Contact' : 'New Companion');
  const photo = data?.photo?.[0]?.value;
  const isBase64 = photo && (photo.startsWith('data:') || /^[A-Za-z0-9+/=]+$/.test(photo.replace(/\s/g, '')));
  const photoUrl = isBase64 && !photo.startsWith('data:') ? `data:image/jpeg;base64,${photo}` : photo;

  let nValue = data?.n?.[0]?.value;
  let nParts: string[] = [];
  if (Array.isArray(nValue)) {
    nParts = [...nValue];
  } else if (typeof nValue === 'string') {
    nParts = nValue.split(';');
  } else if (data?.fn?.[0]?.value) {
    const parts = data.fn[0].value.split(' ');
    const lastName = parts.length > 1 ? parts.pop() || '' : '';
    const firstName = parts.join(' ');
    nParts = [lastName, firstName, '', '', ''];
  }
  
  while (nParts.length < 5) nParts.push('');

  const isPrefixVisible = showPrefix || !!nParts[3];
  const isAdditionalVisible = showAdditional || !!nParts[2];
  const isSuffixVisible = showSuffix || !!nParts[4];

  const groups = React.useMemo(() => Array.from(new Set(allContacts.flatMap(c => 
    c.parsed.categories?.flatMap((cat: any) => 
      cat.value ? cat.value.split(',').map((s: string) => s.trim()).filter(Boolean) : []
    ) || []
  ))).sort(), [allContacts]);

  const contactNames = React.useMemo(() => allContacts.map(c => c.parsed.fn?.[0]?.value).filter(Boolean).sort(), [allContacts]);

  const renderPair = (key1: string, key2: string, section1: React.ReactElement, section2: React.ReactElement) => {
    const has1 = data?.[key1]?.length > 0;
    const has2 = data?.[key2]?.length > 0;

    if (!isEditing && !has1 && !has2) return null;

    if (isEditing) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mb-8">
          {React.cloneElement(section1, { className: 'mb-0' })}
          {React.cloneElement(section2, { className: 'mb-0' })}
        </div>
      );
    }

    if (has1 && has2) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 mb-8">
          {React.cloneElement(section1, { className: 'mb-0' })}
          {React.cloneElement(section2, { className: 'mb-0' })}
        </div>
      );
    }

    return (
      <>
        {has1 && section1}
        {has2 && section2}
      </>
    );
  };

  return (
    <div className="p-8 max-w-3xl mx-auto w-full relative">
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-4 text-red-600 flex items-center">
              <AlertCircle className="w-6 h-6 mr-2" />
              Confirm Deletion
            </h3>
            <p className="mb-6">
              Are you sure you want to delete {contact?.parsed.fn?.[0]?.value || 'this contact'}? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button 
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-800 rounded-md hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-700 text-white rounded-md hover:bg-red-600 transition-colors flex items-center"
                disabled={isSaving}
              >
                {isSaving ? 'Deleting...' : 'Delete Contact'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-8 relative gap-4">
        {onCancel && (
          <button 
            onClick={onCancel}
            className="md:hidden absolute -top-4 -left-4 p-2 bg-[var(--bg-color)] rounded-full text-tardis hover:bg-tardis/10 transition-colors shadow-sm z-10"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <div className="flex items-center space-x-4 md:space-x-6 mt-4 md:mt-0 max-w-full">
          <div className="w-16 h-16 md:w-24 md:h-24 shrink-0 bg-tardis rounded-full flex items-center justify-center text-2xl md:text-4xl text-white font-bold shadow-lg border-2 md:border-4 border-dalek relative group overflow-hidden">
            <div className="absolute inset-0 rounded-full bg-tardis animate-pulse opacity-20 group-hover:opacity-40 transition-opacity"></div>
            {photoUrl ? (
              <img src={photoUrl} alt={fn} className="w-full h-full object-cover relative z-10" referrerPolicy="no-referrer" />
            ) : (
              <span className="relative z-10">{fn.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl md:text-3xl font-bold truncate pr-4">{fn}</h2>
            {contact && <p className="text-sm md:text-base text-gray-500 mt-1 truncate">ID: {contact.id.split('/').pop()}</p>}
            {!contact && (
              <div className="mt-2">
                <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">Save to Address Book</label>
                <select 
                  value={selectedAddressBookUrl}
                  onChange={(e) => setSelectedAddressBookUrl(e.target.value)}
                  className="w-full max-w-xs px-3 py-1.5 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis text-sm"
                >
                  {availableAddressBooks.map(ab => (
                    <option key={ab.url} value={ab.url}>{ab.displayName}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex-shrink-0 w-full md:w-auto mt-4 md:mt-0 flex md:justify-end">
          {!isEditing ? (
            <div className="flex items-center space-x-2 w-full md:w-auto justify-end">
              <button 
                onClick={handleRemoveContact}
                disabled={isSaving}
                className="p-2.5 bg-red-700 text-white rounded-md hover:bg-red-600 transition-colors shadow-md disabled:opacity-50"
                title="Delete Contact"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setIsEditing(true)}
                className="flex flex-1 md:flex-none items-center justify-center space-x-2 px-4 py-2.5 bg-dalek text-black font-semibold rounded-md hover:bg-dalek-dark transition-colors shadow-md"
              >
                <Edit2 className="w-4 h-4" />
                <span>Regenerate</span>
              </button>
            </div>
          ) : (
            <div className="flex space-x-3 w-full md:w-auto justify-end">
              <button 
                onClick={() => {
                  if (contact) {
                    setIsEditing(false);
                    setEditedData(JSON.parse(JSON.stringify(contact.parsed)));
                    setSaveError(null);
                  } else if (onCancel) {
                    onCancel();
                  }
                }}
                className="flex flex-1 md:flex-none items-center justify-center space-x-2 px-4 py-2.5 bg-gray-200 text-gray-800 font-semibold rounded-md hover:bg-gray-300 transition-colors"
                disabled={isSaving}
              >
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="flex flex-1 md:flex-none items-center justify-center space-x-2 px-4 py-2.5 bg-dalek text-black font-semibold rounded-md hover:bg-dalek-dark transition-colors shadow-md disabled:opacity-50"
              >
                {isSaving ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black"></div>
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Save</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {saveError && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md flex items-start">
          <AlertCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
          <p>{saveError}</p>
        </div>
      )}

      <div className="space-y-8 bg-[var(--panel-bg)] p-8 rounded-2xl shadow-lg border border-[var(--border-color)]">
        
        <div>
          <div className="flex items-center space-x-2 mb-4 px-3 py-1.5 bg-tardis/5 dark:bg-tardis/20 rounded-lg border-l-4 border-tardis">
            <User className="w-5 h-5 text-tardis" />
            <h3 className="text-sm font-bold text-tardis">Name</h3>
          </div>
          <div className="space-y-3 pl-3">
            {isEditing ? (
              <div className="flex flex-col space-y-2 w-full">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
                  {isPrefixVisible && (
                    <input 
                      type="text" 
                      placeholder="Prefix"
                      value={nParts[3] || ''}
                      onChange={(e) => handleNameChange(3, e.target.value)}
                      className="w-full sm:w-20 px-2 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis text-sm"
                    />
                  )}
                  <input 
                    type="text" 
                    placeholder="Given Name"
                    value={nParts[1] || ''}
                    onChange={(e) => handleNameChange(1, e.target.value)}
                    className="w-full sm:flex-1 px-2 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis text-sm"
                  />
                  {isAdditionalVisible && (
                    <input 
                      type="text" 
                      placeholder="Additional Names"
                      value={nParts[2] || ''}
                      onChange={(e) => handleNameChange(2, e.target.value)}
                      className="w-full sm:flex-1 px-2 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis text-sm"
                    />
                  )}
                  <input 
                    type="text" 
                    placeholder="Family Name"
                    value={nParts[0] || ''}
                    onChange={(e) => handleNameChange(0, e.target.value)}
                    className="w-full sm:flex-1 px-2 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis text-sm"
                  />
                  {isSuffixVisible && (
                    <input 
                      type="text" 
                      placeholder="Suffix"
                      value={nParts[4] || ''}
                      onChange={(e) => handleNameChange(4, e.target.value)}
                      className="w-full sm:w-20 px-2 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis text-sm"
                    />
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-sm">
                  {!isPrefixVisible && (
                    <button onClick={() => setShowPrefix(true)} className="text-tardis hover:text-tardis-light font-medium flex items-center transition-colors">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Prefix
                    </button>
                  )}
                  {!isAdditionalVisible && (
                    <button onClick={() => setShowAdditional(true)} className="text-tardis hover:text-tardis-light font-medium flex items-center transition-colors">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Additional Names
                    </button>
                  )}
                  {!isSuffixVisible && (
                    <button onClick={() => setShowSuffix(true)} className="text-tardis hover:text-tardis-light font-medium flex items-center transition-colors">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Suffix
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-1 flex items-center space-x-2">
                <span className="font-medium text-lg">{data?.fn?.[0]?.value || ''}</span>
              </div>
            )}
          </div>
        </div>

        {renderPair(
          'nickname', 'gender',
          <FieldSection 
            icon={<Tag className="w-5 h-5 text-tardis" />}
            title="Nickname"
            fieldKey="nickname"
            data={data}
            isEditing={isEditing}
            onUpdate={updateField}
            onAdd={addField}
            onRemove={removeField}
          />,
          <FieldSection 
            icon={<UserCheck className="w-5 h-5 text-tardis" />}
            title="Gender"
            fieldKey="gender"
            data={data}
            isEditing={isEditing}
            onUpdate={updateField}
            onAdd={addField}
            onRemove={removeField}
            single
            selectOptions={[
              { label: 'Male', value: 'M' },
              { label: 'Female', value: 'F' }
            ]}
          />
        )}

        <FieldSection 
          icon={<MapPin className="w-5 h-5 text-tardis" />}
          title="Address"
          fieldKey="adr"
          data={data}
          isEditing={isEditing}
          onUpdate={updateField}
          onAdd={addField}
          onRemove={removeField}
          hasType
          hasPref
          isAddress
        />

        {renderPair(
          'bday', 'anniversary',
          <FieldSection 
            icon={<Cake className="w-5 h-5 text-tardis" />}
            title="Birthday"
            fieldKey="bday"
            data={data}
            isEditing={isEditing}
            onUpdate={updateField}
            onAdd={addField}
            onRemove={removeField}
            single
            isDate
          />,
          <FieldSection 
            icon={<Heart className="w-5 h-5 text-tardis" />}
            title="Anniversary date"
            fieldKey="anniversary"
            data={data}
            isEditing={isEditing}
            onUpdate={updateField}
            onAdd={addField}
            onRemove={removeField}
            single
            isDate
          />
        )}

        <FieldSection 
          icon={<Phone className="w-5 h-5 text-tardis" />}
          title="Phone number"
          fieldKey="tel"
          data={data}
          isEditing={isEditing}
          onUpdate={updateField}
          onAdd={addField}
          onRemove={removeField}
          hasType
          hasPref
        />

        <FieldSection 
          icon={<Mail className="w-5 h-5 text-tardis" />}
          title="Email"
          fieldKey="email"
          data={data}
          isEditing={isEditing}
          onUpdate={updateField}
          onAdd={addField}
          onRemove={removeField}
          hasType
          hasPref
        />

        <FieldSection 
          icon={<Users className="w-5 h-5 text-tardis" />}
          title="Groups"
          fieldKey="categories"
          data={(() => {
            if (!data || !data.categories) return data;
            
            // In read-only mode, render as a single comma-separated string
            if (!isEditing) {
              const allValues = data.categories.flatMap((cat: any) => 
                cat.value ? cat.value.split(',').map((s:string) => s.trim()).filter(Boolean) : []
              );
              return { ...data, categories: allValues.length > 0 ? [{ value: allValues.join(', ') }] : [] };
            }

            // In edit mode, flatten the strings but DO NOT filter out empty values (so newly added inputs render)
            const splitCategories = data.categories.flatMap((cat: any) => 
              // If the value is entirely empty (like just a comma), split returns empty strings
              typeof cat.value === 'string' ? cat.value.split(',').map((s:string) => ({ value: s.trim() })) : []
            );
            return { ...data, categories: splitCategories };
          })()}
          isEditing={isEditing}
          isGrid={true}
          onUpdate={(key, index, field, value) => {
            const newData = { ...editedData };
            
            let currentSplit = (newData.categories || []).flatMap((cat: any) => 
              typeof cat.value === 'string' ? cat.value.split(',').map((s:string) => ({ value: s.trim() })) : []
            );
            
            if (!currentSplit[index]) currentSplit[index] = { value: '', type: '' };
            currentSplit[index][field] = value;
            
            // Join everything back but keeping empty entries intact except purely structural ones
            // Actually, joining with commas acts as an array serialization here.
            const values = currentSplit.map((c: any) => c.value);
            if (values.length > 0) {
              // Only remove completely empty trailing elements if we want to clean up on save,
              // but while typing we must keep empty strings so the input field exists.
              newData.categories = [{ value: values.join(',') }];
            } else {
              newData.categories = [];
            }
            
            setEditedData(newData);
          }}
          onAdd={(key) => {
            // Add an empty string to allow a new input field
            const newData = { ...editedData };
            let currentValues = (newData.categories || []).flatMap((cat: any) => 
              typeof cat.value === 'string' ? cat.value.split(',').map((s:string) => s.trim()) : []
            );
            
            currentValues.push(''); // Add a new empty entry
            newData.categories = [{ value: currentValues.join(',') }];
            setEditedData(newData);
          }}
          onRemove={(key, index) => {
            const newData = { ...editedData };
            let currentValues = (newData.categories || []).flatMap((cat: any) => 
              typeof cat.value === 'string' ? cat.value.split(',').map((s:string) => s.trim()) : []
            );
            currentValues.splice(index, 1);
            
            if (currentValues.length > 0) {
              newData.categories = [{ value: currentValues.join(',') }];
            } else {
              newData.categories = [];
            }
            setEditedData(newData);
          }}
          addLabel="Add Group"
          autocompleteOptions={groups}
        />

        <FieldSection 
          icon={<Link2 className="w-5 h-5 text-tardis" />}
          title="Relationships to other contacts"
          fieldKey="related"
          data={data}
          isEditing={isEditing}
          onUpdate={updateField}
          onAdd={addField}
          onRemove={removeField}
          hasType
          autocompleteOptions={contactNames}
        />

        {renderPair(
          'url', 'impp',
          <FieldSection 
            icon={<Link className="w-5 h-5 text-tardis" />}
            title="Website or related URLs"
            fieldKey="url"
            data={data}
            isEditing={isEditing}
            onUpdate={updateField}
            onAdd={addField}
            onRemove={removeField}
            hasType
            hasPref
          />,
          <FieldSection 
            key="impp"
            icon={<MessageSquare className="w-5 h-5 text-tardis" />}
            title="Instant Messaging"
            fieldKey="impp"
            data={data}
            isEditing={isEditing}
            onUpdate={updateField}
            onAdd={addField}
            onRemove={removeField}
            hasType
            hasPref
          />
        )}

        {renderPair(
          'lang', 'tz',
          <FieldSection 
            icon={<Globe className="w-5 h-5 text-tardis" />}
            title="Language"
            fieldKey="lang"
            data={data}
            isEditing={isEditing}
            onUpdate={updateField}
            onAdd={addField}
            onRemove={removeField}
          />,
          <FieldSection 
            icon={<Clock className="w-5 h-5 text-tardis" />}
            title="Time zone"
            fieldKey="tz"
            data={data}
            isEditing={isEditing}
            onUpdate={updateField}
            onAdd={addField}
            onRemove={removeField}
          />
        )}

        {renderPair(
          'role', 'geo',
          <FieldSection 
            icon={<UserCheck className="w-5 h-5 text-tardis" />}
            title="Role or occupation"
            fieldKey="role"
            data={data}
            isEditing={isEditing}
            onUpdate={updateField}
            onAdd={addField}
            onRemove={removeField}
          />,
          <FieldSection 
            icon={<Map className="w-5 h-5 text-tardis" />}
            title="Geographical coordinates"
            fieldKey="geo"
            data={data}
            isEditing={isEditing}
            onUpdate={updateField}
            onAdd={addField}
            onRemove={removeField}
          />
        )}

        {renderPair(
          'org', 'title',
          <FieldSection 
            icon={<Briefcase className="w-5 h-5 text-tardis" />}
            title="Organisation"
            fieldKey="org"
            data={data}
            isEditing={isEditing}
            onUpdate={updateField}
            onAdd={addField}
            onRemove={removeField}
          />,
          <FieldSection 
            icon={<Award className="w-5 h-5 text-tardis" />}
            title="Job title or functional position"
            fieldKey="title"
            data={data}
            isEditing={isEditing}
            onUpdate={updateField}
            onAdd={addField}
            onRemove={removeField}
          />
        )}

        <FieldSection 
          icon={<FileText className="w-5 h-5 text-tardis" />}
          title="Supplemental information or notes"
          fieldKey="note"
          data={data}
          isEditing={isEditing}
          onUpdate={updateField}
          onAdd={addField}
          onRemove={removeField}
        />

        {/* Custom Fields Section */}
        {(() => {
          const customKeys = Object.keys(data || {}).filter(k => {
            const lower = k.toLowerCase();
            return lower.startsWith('x-') || lower.startsWith('vnd-');
          });
          if (customKeys.length === 0) return null;

          return (
            <div className="mt-8 border-t border-[var(--border-color)] pt-6">
              <h3 className="text-lg font-bold mb-4 flex items-center text-tardis">
                <Tag className="w-5 h-5 mr-2" />
                Custom fields
              </h3>
              
              {customKeys.map(key => (
                <FieldSection
                  key={key}
                  icon={<Tag className="w-4 h-4 text-gray-400" />}
                  title={key.toUpperCase()}
                  fieldKey={key}
                  data={data}
                  isEditing={isEditing}
                  onUpdate={updateField}
                  onAdd={addField}
                  onRemove={removeField}
                />
              ))}
            </div>
          );
        })()}

      </div>
    </div>
  );
}

function DateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const parsedValue = React.useMemo(() => {
    if (!value) return '';
    let d = value.replace('T', '');
    if (/^\d{8}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    if (/^--\d{4}$/.test(d)) return `--${d.slice(2, 4)}-${d.slice(4, 6)}`;
    return d; 
  }, [value]);

  const [omitYear, setOmitYear] = useState(() => parsedValue.startsWith('--'));

  // Sync checkbox state if value changes externally
  useEffect(() => {
    if (parsedValue === '') {
      setOmitYear(false);
    } else {
      setOmitYear(parsedValue.startsWith('--'));
    }
  }, [parsedValue]);

  return (
    <div className="flex flex-col sm:flex-row w-full items-start sm:items-center gap-2">
      <input
        type="text"
        placeholder={omitYear ? "--MM-DD" : "YYYY-MM-DD"}
        value={parsedValue}
        onChange={(e) => {
          let val = e.target.value;
          if (val === '--') {
            setOmitYear(true);
          } else if (val === '') {
            setOmitYear(false);
            onChange('');
            return;
          } else {
            setOmitYear(val.startsWith('--'));
          }
          // Enforce basic characters for date
          val = val.replace(/[^\d\--]/g, '');
          onChange(val);
        }}
        className="w-full sm:flex-1 px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis font-mono"
      />
      <label className="flex items-center space-x-2 text-sm text-[var(--text-color)] whitespace-nowrap cursor-pointer shrink-0">
        <input
          type="checkbox"
          checked={omitYear}
          onChange={(e) => {
            const omit = e.target.checked;
            setOmitYear(omit);
            if (omit) {
              if (parsedValue && parsedValue.length >= 10 && !parsedValue.startsWith('--')) {
                onChange(`--${parsedValue.slice(5)}`);
              } else {
                onChange('--');
              }
            } else {
              if (parsedValue.startsWith('--') && parsedValue.length >= 6) {
                onChange(`${new Date().getFullYear()}-${parsedValue.slice(2)}`);
              } else {
                onChange('');
              }
            }
          }}
          className="rounded border-[var(--border-color)] text-tardis focus:ring-tardis"
        />
        <span>No year</span>
      </label>
    </div>
  );
}

function AutocompleteInput({ 
  value, 
  onChange, 
  options, 
  placeholder 
}: { 
  value: string, 
  onChange: (v: string) => void, 
  options: string[], 
  placeholder?: string 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  
  const filteredOptions = options.filter(opt => 
    opt.toLowerCase().includes(value.toLowerCase()) && opt !== value
  ).slice(0, 5); // Limit to 5 options to not overburden UI

  useEffect(() => {
    setIsOpen(isFocused && filteredOptions.length > 0);
  }, [value, isFocused, filteredOptions.length]);

  return (
    <div className="relative flex-1">
      <input 
        type="text" 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 200)} // Delay to allow click
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis"
      />
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filteredOptions.map((opt, i) => (
            <div 
              key={i}
              className="px-3 py-2 cursor-pointer hover:bg-tardis/10 text-sm"
              onClick={() => {
                onChange(opt);
                setIsOpen(false);
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldSection({ 
  icon, title, fieldKey, data, isEditing, onUpdate, onAdd, onRemove, single = false, isDate = false, hasType = false, hasPref = false, isAddress = false, selectOptions = null, addLabel, autocompleteOptions = null, className, isGrid = false
}: { 
  key?: React.Key,
  icon: React.ReactNode, title: string, fieldKey: string, data: any, isEditing: boolean, 
  onUpdate: (k: string, i: number, f: string, v: string) => void,
  onAdd: (k: string) => void,
  onRemove: (k: string, i: number) => void,
  single?: boolean,
  isDate?: boolean,
  hasType?: boolean,
  hasPref?: boolean,
  isAddress?: boolean,
  selectOptions?: string[] | {label: string, value: string}[] | null,
  addLabel?: string,
  autocompleteOptions?: string[] | null,
  className?: string,
  isGrid?: boolean
}) {
  const items = data?.[fieldKey] || [];

  const COMMON_TYPES: Record<string, string[]> = {
    tel: ['home', 'work', 'cell', 'fax', 'pager', 'video', 'text', 'voice'],
    email: ['home', 'work'],
    adr: ['home', 'work'],
    impp: ['home', 'work'],
    url: ['home', 'work'],
    related: ['child', 'parent', 'sibling', 'spouse', 'kin', 'muse', 'crush', 'date', 'sweetheart', 'me', 'agent', 'emergency']
  };

  const getAddressPart = (itemValue: any, index: number) => {
    if (Array.isArray(itemValue)) return itemValue[index] || '';
    if (typeof itemValue === 'string') return itemValue.split(';')[index] || '';
    return '';
  };
  
  const updateAddressPart = (itemValue: any, index: number, newValue: string) => {
    let parts: string[] = [];
    if (Array.isArray(itemValue)) {
       parts = [...itemValue];
    } else if (typeof itemValue === 'string') {
       parts = itemValue.split(';');
    }
    while(parts.length < 7) parts.push('');
    parts[index] = newValue;
    return parts;
  };

  const types = COMMON_TYPES[fieldKey] || [];

  if (!isEditing && items.length === 0) return null;

  return (
    <div className={cn("mb-8 min-w-0", className)}>
      <div className="flex items-center space-x-2 mb-4 px-3 py-1.5 bg-tardis/5 dark:bg-tardis/20 rounded-lg border-l-4 border-tardis">
        {icon}
        <h3 className="text-sm font-bold text-tardis">{title}</h3>
      </div>
      
      <div className="pl-3">
        <div className={cn(isGrid && isEditing ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : "space-y-3")}>
          {items.map((item: any, idx: number) => (
            <div key={idx} className="flex flex-col space-y-2 min-w-0 border-b border-tardis/10 pb-3 last:border-0 last:pb-0">
              <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3 w-full min-w-0">
              {isEditing ? (
                <>
                  <div className="flex-1 w-full min-w-0 sm:min-w-[250px]">
                    {selectOptions ? (
                      <select
                        value={(() => {
                          const currentVal = item.value || '';
                          const matchedOpt = selectOptions.find(opt => {
                            const v = typeof opt === 'string' ? opt : opt.value;
                            return v.toLowerCase() === currentVal.toLowerCase();
                          });
                          return matchedOpt ? (typeof matchedOpt === 'string' ? matchedOpt : matchedOpt.value) : '';
                        })()}
                        onChange={(e) => onUpdate(fieldKey, idx, 'value', e.target.value)}
                        className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis"
                      >
                        <option value="">Not specified</option>
                        {selectOptions.map(opt => {
                          const val = typeof opt === 'string' ? opt : opt.value;
                          const label = typeof opt === 'string' ? opt.charAt(0).toUpperCase() + opt.slice(1) : opt.label;
                          return <option key={val} value={val}>{label}</option>;
                        })}
                      </select>
                    ) : isAddress ? (
                      <div className="flex flex-col space-y-2 w-full">
                        <input 
                          type="text" 
                          placeholder="Address"
                          value={getAddressPart(item.value, 2)} 
                          onChange={(e) => {
                            onUpdate(fieldKey, idx, 'value', updateAddressPart(item.value, 2, e.target.value) as any);
                          }}
                          className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis"
                        />
                        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                          <input 
                            type="text" 
                            placeholder="City"
                            value={getAddressPart(item.value, 3)} 
                            onChange={(e) => {
                              onUpdate(fieldKey, idx, 'value', updateAddressPart(item.value, 3, e.target.value) as any);
                            }}
                            className="w-full sm:flex-1 px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis"
                          />
                          <input 
                            type="text" 
                            placeholder="Region"
                            value={getAddressPart(item.value, 4)} 
                            onChange={(e) => {
                              onUpdate(fieldKey, idx, 'value', updateAddressPart(item.value, 4, e.target.value) as any);
                            }}
                            className="w-full sm:flex-1 px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis"
                          />
                        </div>
                        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                          <input 
                            type="text" 
                            placeholder="ZIP"
                            value={getAddressPart(item.value, 5)} 
                            onChange={(e) => {
                              onUpdate(fieldKey, idx, 'value', updateAddressPart(item.value, 5, e.target.value) as any);
                            }}
                            className="w-full sm:w-1/3 px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis"
                          />
                          <input 
                            type="text" 
                            placeholder="Country"
                            value={getAddressPart(item.value, 6)} 
                            onChange={(e) => {
                              onUpdate(fieldKey, idx, 'value', updateAddressPart(item.value, 6, e.target.value) as any);
                            }}
                            className="w-full sm:flex-1 px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis"
                          />
                        </div>
                      </div>
                    ) : autocompleteOptions ? (
                      <div className="w-full">
                        <AutocompleteInput 
                          value={item.value || ''}
                          onChange={(v) => onUpdate(fieldKey, idx, 'value', v)}
                          options={autocompleteOptions}
                        />
                      </div>
                    ) : isDate && (typeof item.params?.value === 'string' ? item.params.value.toLowerCase() !== 'text' : !(Array.isArray(item.params?.value) && item.params.value.some((x: string) => x.toLowerCase() === 'text'))) ? (
                      <div className="w-full">
                        <DateInput 
                          value={item.value || ''}
                          onChange={(v) => onUpdate(fieldKey, idx, 'value', v)}
                        />
                      </div>
                    ) : (
                      <input 
                        type="text" 
                        value={item.value || ''} 
                        onChange={(e) => onUpdate(fieldKey, idx, 'value', e.target.value)}
                        className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis"
                      />
                    )}
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-start mt-1 sm:mt-0">
                    <div className="flex flex-wrap items-center gap-2 flex-1 sm:flex-none">
                      {hasPref && (
                        <div className="flex items-center space-x-1 pl-1">
                          <Star 
                            className={cn("w-5 h-5 cursor-pointer transition-colors shrink-0", item.pref ? "text-yellow-500 fill-yellow-500" : "text-gray-300 hover:text-yellow-400")} 
                            onClick={() => onUpdate(fieldKey, idx, 'pref', item.pref ? '' : '1')}
                            title="Mark as Preferred"
                          />
                          {item.pref && (
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={item.pref}
                              onChange={(e) => onUpdate(fieldKey, idx, 'pref', e.target.value)}
                              className="w-12 px-1 py-1 text-xs text-center bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400"
                              title="Preference (1 = highest)"
                            />
                          )}
                        </div>
                      )}
                      {hasType && (
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={types.includes(item.type?.toLowerCase()) ? item.type?.toLowerCase() : (item.type ? 'other' : '')}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === 'other') {
                                onUpdate(fieldKey, idx, 'type', 'custom');
                              } else {
                                onUpdate(fieldKey, idx, 'type', val);
                              }
                            }}
                            className="px-2 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis text-sm min-w-[90px] flex-1 sm:flex-none"
                          >
                            <option value="">No type</option>
                            {types.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                            <option value="other">Other...</option>
                          </select>
                          
                          {(item.type && !types.includes(item.type?.toLowerCase())) && (
                            <input 
                              type="text"
                              placeholder="Custom type"
                              value={item.type === 'custom' ? '' : item.type}
                              onChange={(e) => onUpdate(fieldKey, idx, 'type', e.target.value)}
                              className="flex-1 w-full sm:w-32 px-2 py-2 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-md focus:outline-none focus:ring-2 focus:ring-tardis text-sm"
                              autoFocus={item.type === 'custom'}
                            />
                          )}
                        </div>
                      )}
                    </div>
                    {!single && (
                      <button 
                        onClick={() => onRemove(fieldKey, idx)}
                        className="p-2 text-red-500 hover:bg-red-100 rounded-md transition-colors shrink-0"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-1 flex flex-wrap items-center gap-2 max-w-full">
                  <span className="font-medium break-all sm:break-words max-w-full">
                    {fieldKey === 'gender' 
                      ? (typeof item.value === 'string' && item.value.toUpperCase() === 'M' ? 'Male' : typeof item.value === 'string' && item.value.toUpperCase() === 'F' ? 'Female' : item.value)
                      : isAddress 
                        ? (Array.isArray(item.value) ? item.value : (item.value || '').split(';')).slice(2).filter(Boolean).join(', ')
                        : isDate && (typeof item.params?.value === 'string' ? item.params.value.toLowerCase() !== 'text' : !(Array.isArray(item.params?.value) && item.params.value.some((x: string) => x.toLowerCase() === 'text')))
                          ? (() => {
                              const v = item.value || '';
                              let d = typeof v === 'string' ? v.replace('T', '') : '';
                              if (/^\d{8}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
                              if (/^--\d{4}$/.test(d)) return `--${d.slice(2, 4)}-${d.slice(4, 6)}`;
                              return d; 
                            })()
                          : Array.isArray(item.value) ? item.value.join(' ') : item.value}
                  </span>
                  {item.pref && (
                    <span 
                      className="flex items-center text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 rounded-full font-bold ml-2"
                      title={`Preference Level: ${item.pref}`}
                    >
                      <Star className="w-3 h-3 mr-1 fill-current" />
                      PREF{item.pref !== '1' ? ` ${item.pref}` : ''}
                    </span>
                  )}
                  {item.type && (
                    <span className="text-xs px-2 py-0.5 bg-tardis/10 text-tardis rounded-full uppercase font-bold">
                      {item.type}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        </div>
        
        {isEditing && (!single || items.length === 0) && (
          <button 
            onClick={() => onAdd(fieldKey)}
            className="flex items-center space-x-1 text-sm text-tardis hover:text-tardis-light font-medium mt-3"
          >
            <Plus className="w-4 h-4" />
            <span>{addLabel || `Add ${title}`}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: (u: string, p: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTesting(true);
    setError(null);
    try {
      await axios.post('/api/login', { rememberMe }, {
        auth: { username, password }
      });
      onLogin(username, password);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <div className="bg-[var(--panel-bg)] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col border border-tardis/30">
        <div className="flex justify-center items-center p-6 border-b border-tardis/20 bg-gradient-to-r from-tardis to-tardis-dark text-white">
          <h2 className="text-2xl font-bold flex items-center tracking-tight">
            <Lock className="w-6 h-6 mr-3 text-dalek" />
            Sign In
          </h2>
        </div>
        
        <form onSubmit={handleLogin} className="p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2 text-tardis">Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-tardis transition-shadow"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-tardis">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-[var(--bg-color)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-2 focus:ring-tardis transition-shadow"
              required
            />
          </div>
          
          <div className="flex items-center pt-2">
            <input
              type="checkbox"
              id="rememberMe"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 text-tardis bg-[var(--bg-color)] border-[var(--border-color)] rounded focus:ring-tardis focus:ring-2"
            />
            <label htmlFor="rememberMe" className="ml-2 text-sm font-medium text-[var(--text-color)]">
              Remember me (90 days)
            </label>
          </div>
          
          <div className="pt-2">
            <button 
              type="submit"
              disabled={isTesting || !username || !password}
              className="w-full py-3 bg-tardis text-white font-bold rounded-lg hover:bg-tardis-light transition-colors shadow-md disabled:opacity-50 flex items-center justify-center"
            >
              {isTesting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                  Authenticating...
                </>
              ) : 'Sign In'}
            </button>
          </div>

          {error && (
            <div className="p-4 bg-red-100 text-red-800 border border-red-300 rounded-lg text-sm flex items-start">
              <AlertCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
