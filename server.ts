import express from 'express';
import path from 'path';
import { DAVClient } from 'tsdav';
import vCard from 'vcf';
import crypto from 'crypto';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const SESSION_SECRET = crypto.randomBytes(32);

function encrypt(text: string) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', SESSION_SECRET, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(text: string) {
  try {
    const parts = text.split(':');
    if (parts.length !== 3) return null;
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv('aes-256-gcm', SESSION_SECRET, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return null;
  }
}

function parseCookies(cookieHeader?: string) {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    if (!value) return;
    list[name] = decodeURIComponent(value);
  });
  return list;
}

function getCredentials(req: express.Request) {
  // 1. Try Basic Auth
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Basic ')) {
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    // Password might contain colons, so we only split on the first one
    const colonIndex = credentials.indexOf(':');
    if (colonIndex !== -1) {
      const username = credentials.substring(0, colonIndex);
      const password = credentials.substring(colonIndex + 1);
      return { username, password };
    }
  }

  // 2. Try Cookie
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.carddav_session) {
    const decrypted = decrypt(cookies.carddav_session);
    if (decrypted) {
      try {
        const parsed = JSON.parse(decrypted);
        if (parsed.username && parsed.password) {
          return parsed;
        }
      } catch (e) {}
    }
  }

  return null;
}

// Get config (now just returns color scheme and whether server is configured)
app.get('/api/config', (_req, res) => {
  res.json({ 
    colorScheme: process.env.COLOR_SCHEME || 'system',
    hasServerUrl: !!process.env.CARDDAV_URL
  });
});

// Test connection (login)
app.post('/api/login', async (req, res) => {
  const credentials = getCredentials(req);
  if (!credentials) {
    return res.status(401).json({ success: false, error: 'Missing credentials' });
  }
  
  const serverUrl = process.env.CARDDAV_URL;
  if (!serverUrl) {
    return res.status(500).json({ success: false, error: 'Server URL not configured' });
  }
  
  try {
    const client = new DAVClient({
      serverUrl,
      credentials,
      authMethod: 'Basic',
      defaultAccountType: 'carddav',
    });
    
    await client.login();

    if (req.body.rememberMe) {
      const encrypted = encrypt(JSON.stringify(credentials));
      // 90 days = 7776000 seconds
      res.setHeader('Set-Cookie', `carddav_session=${encodeURIComponent(encrypted)}; HttpOnly; Path=/; Max-Age=7776000; SameSite=Strict`);
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('Login failed:', err);
    res.status(401).json({ success: false, error: err.message || 'Authentication failed' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'carddav_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict');
  res.json({ success: true });
});

function filterAddressBooksByUrl(addressBooks: any[], serverUrl: string) {
  try {
    const serverUrlObj = new URL(serverUrl);
    const normalizedServerPath = serverUrlObj.pathname.replace(/\/$/, '');
    const exactMatch = addressBooks.find(ab => {
      const abUrlObj = new URL(ab.url, serverUrl);
      return abUrlObj.pathname.replace(/\/$/, '') === normalizedServerPath;
    });
    if (exactMatch) {
      return [exactMatch];
    }
  } catch (e) {
    console.error('Error filtering address books by URL:', e);
  }
  return addressBooks;
}

// Fetch contacts
app.get('/api/contacts', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  try {
    const credentials = getCredentials(req);
    if (!credentials) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const serverUrl = process.env.CARDDAV_URL;
    if (!serverUrl) {
      return res.status(500).json({ error: 'Server URL not configured' });
    }
    
    const client = new DAVClient({
      serverUrl,
      credentials,
      authMethod: 'Basic',
      defaultAccountType: 'carddav',
    });
    
    await client.login();
    let addressBooks = await client.fetchAddressBooks();
    addressBooks = filterAddressBooksByUrl(addressBooks, serverUrl);
    
    const allContacts: any[] = [];
    
    await Promise.all(addressBooks.map(async (addressBook) => {
      // 1. Get all vcf files via PROPFIND
      const propfindResponse = await client.davRequest({
        url: addressBook.url,
        init: {
          method: 'PROPFIND',
          namespace: 'd',
          headers: { depth: '1' },
          body: {
            'propfind': {
              _attributes: {
                'xmlns:d': 'DAV:',
                'xmlns:card': 'urn:ietf:params:xml:ns:carddav',
              },
              'prop': {
                'getetag': {}
              }
            }
          }
        }
      });
      
      const hrefs = propfindResponse
        .map(r => r.href)
        .filter(href => href && href.endsWith('.vcf'));
        
      if (hrefs.length > 0) {
        // 2. Fetch vCard data via REPORT addressbook-multiget
        const multigetResponse = await client.davRequest({
          url: addressBook.url,
          init: {
            method: 'REPORT',
            namespace: 'card',
            headers: { depth: '1' },
            body: {
              'addressbook-multiget': {
                _attributes: {
                  'xmlns:d': 'DAV:',
                  'xmlns:card': 'urn:ietf:params:xml:ns:carddav',
                },
                'd:prop': {
                  'd:getetag': {},
                  'card:address-data': {}
                },
                'd:href': hrefs.map(href => ({ _text: href }))
              }
            }
          }
        });
        
        const vcards = multigetResponse.map(res => {
          let data = res.props?.addressData?._cdata || res.props?.addressData?._text || res.props?.addressData;
          if (typeof data === 'string') {
            data = data.replace(/\r?\n/g, '\r\n');
          }
          return {
            url: new URL(res.href || '', addressBook.url).href,
            etag: res.props?.getetag,
            data: data
          };
        }).filter(v => typeof v.data === 'string');
        
        for (const vcardObj of vcards) {
          try {
            const parsed = vCard.parse(vcardObj.data);
            const vcardData = parsed[0].data;
            
            // Check KIND property. We only want 'individual' (or missing, which implies individual).
            let kind = 'individual';
            if (vcardData.kind) {
              const kindItem = Array.isArray(vcardData.kind) ? vcardData.kind[0] : vcardData.kind;
              const kindValue = kindItem ? kindItem.valueOf() : null;
              if (typeof kindValue === 'string') {
                kind = kindValue.toLowerCase();
              }
            }
            if (kind !== 'individual') {
              continue; // Skip KIND:group, KIND:org, etc.
            }

            const normalized: any = {
              version: parsed[0].version.valueOf()
            };
            
            for (const key in vcardData) {
              if (key === 'version') continue;
              const items = Array.isArray((vcardData as any)[key]) ? (vcardData as any)[key] : [(vcardData as any)[key]];
              normalized[key] = items.map((item: any) => {
                const json = item.toJSON();
                // json structure is [key, params, type, value, value2, ...] 
                // However, `valueOf()` or `json` array usually captures compound fields like ADR/N as arrays.
                
                let value = item.valueOf();
                if (Buffer.isBuffer(value)) {
                  value = value.toString('base64');
                }

                // Capture all parameters, and also keep type for UI compatibility
                const params = json[1] || {};
                
                // Use the vcf library's native array format for N and ADR if available
                if (key.toLowerCase() === 'n' || key.toLowerCase() === 'adr') {
                   if (typeof value === 'string') {
                     const parts = [];
                     let current = '';
                     for (let i = 0; i < value.length; i++) {
                       if (value[i] === '\\' && i + 1 < value.length) {
                         current += value[i+1];
                         i++;
                       } else if (value[i] === ';') {
                         parts.push(current);
                         current = '';
                       } else {
                         current += value[i];
                       }
                     }
                     parts.push(current);
                     value = parts;
                   } else if (Array.isArray(json[3])) { // fallback to `toJSON` structure
                     value = json[3].map((v: string) => v.replace(/\\;/g, ';').replace(/\\,/g, ','));
                   }
                } else if (Array.isArray(value)) {
                  value = value.join(';');
                }

                // Proposal 3 Normalize GEO
                if (key.toLowerCase() === 'geo' && typeof value === 'string') {
                  const geoMatch = value.match(/geo:(-?\d+(\.\d+)?,-?\d+(\.\d+)?[^;]*)/i);
                  if (geoMatch) {
                     // already compliant
                  } else if (value.includes(';')) {
                     // v3 legacy -> v4 format
                     const parts = value.split(';');
                     if (parts.length >= 2) {
                       value = `geo:${parts[0]},${parts[1]}`;
                     }
                  }
                }
                
                // Explicitly intercept 'group' from params, ensuring it isn't lost if UI restructures
                let itemGroup = params.group || undefined;
                
                let itemPref = params.pref || '';
                let typeRaw = params.type || [];
                if (!Array.isArray(typeRaw)) typeRaw = typeRaw.split(',');
                
                // Exclude 'pref' from type list, assign to itemPref if true
                const typeArr = typeRaw.map((t: string) => t.toLowerCase());
                if (typeArr.includes('pref')) {
                  itemPref = itemPref || '1';
                }
                const filteredTypes = typeRaw.filter((t: string) => t.toLowerCase() !== 'pref');
                let typeString = filteredTypes.join(',');
                
                return {
                  type: typeString,
                  pref: itemPref,
                  group: itemGroup,
                  params: params,
                  value: value
                };
              });
            }

            // Sync X-ABLabel to type
            for (const key in normalized) {
              if (key.toLowerCase() === 'x-ablabel') continue;
              const items = normalized[key];
              if (!Array.isArray(items)) continue;
              
              for (const item of items) {
                if (item.group && (!item.type || item.type.trim() === '')) {
                   const labels = normalized['x-ablabel'];
                   if (labels && Array.isArray(labels)) {
                     const matchingLabel = labels.find((l: any) => l.group === item.group);
                     if (matchingLabel && matchingLabel.value) {
                       item.type = matchingLabel.value;
                     }
                   }
                }
              }
            }
  
            allContacts.push({
              id: vcardObj.url,
              etag: vcardObj.etag,
              addressBook: addressBook.displayName || 'Default',
              vcard: vcardObj.data,
              parsed: normalized
            });
          } catch (e) {
            console.error('Failed to parse vcard', e);
          }
        }
      }
    }));
    
    res.json({
      contacts: allContacts,
      addressBooks: addressBooks.map(ab => ({
        url: ab.url,
        displayName: ab.displayName || ab.url
      }))
    });
  } catch (err: any) {
    console.error('Fetch contacts failed:', err);
    const status = err.message?.includes('Unauthorized') || err.message?.includes('401') ? 401 : 500;
    res.status(status).json({ error: err.message });
  }
});

function reconstructVCard(parsedData: any): string {
  const card = new vCard();
  const version = typeof parsedData.version === 'string' ? parsedData.version : '4.0';
  card.version = version;
  
  // N is required in vCard 3.0 and 4.0. If not provided, we should generate it from FN.
  if (!parsedData.n || !parsedData.n[0] || !parsedData.n[0].value) {
    if (parsedData.fn && parsedData.fn[0] && parsedData.fn[0].value) {
      const parts = parsedData.fn[0].value.split(' ');
      const lastName = parts.length > 1 ? parts.pop() : '';
      const firstName = parts.join(' ');
      parsedData.n = [{ value: `${lastName};${firstName};;;` }];
    }
  }
  
  for (const key in parsedData) {
    if (key === 'version') continue;
    const items = parsedData[key];
    if (Array.isArray(items)) {
      items.forEach(item => {
        if (item.value) {
          let val = item.value;
          let params = item.params || {};

          // Explicitly restore 'group' back into params for external vCard tools
          if (item.group) {
             params.group = item.group;
          }

          // Sync backwards from our extracted UI types
          if (item.type || item.pref) {
             const newTypes = item.type ? item.type.split(',').filter(Boolean) : [];
             if (item.pref) {
                if (version === '3.0') {
                   // vCard 3 puts PREF in TYPE
                   newTypes.push('PREF');
                } else {
                   // vCard 4 explicitly uses PREF param
                   params.pref = item.pref;
                }
             } else {
                delete params.pref;
             }
             
             if (newTypes.length > 0) {
               params.type = newTypes.length === 1 ? newTypes[0] : newTypes;
             } else {
               delete params.type;
             }
          }
          
          // Special handling for PHOTO
          if (key === 'photo') {
            const isBase64 = /^[A-Za-z0-9+/=]+$/.test(val.replace(/\s/g, ''));
            const isDataUri = val.startsWith('data:');
            
            if (version === '4.0') {
              if (isBase64 && !isDataUri) {
                val = `data:image/jpeg;base64,${val}`;
              }
              // Remove ENCODING parameter for vCard 4.0
              if (params.encoding) {
                const { encoding, ...rest } = params;
                params = rest;
              }
            } else if (version === '3.0') {
              if (isDataUri) {
                // Convert data URI back to raw base64 for vCard 3.0
                const match = val.match(/^data:[^;]+;base64,(.+)$/);
                if (match) {
                  val = match[1];
                  params.encoding = 'b';
                }
              } else if (isBase64) {
                params.encoding = 'b';
              }
            }
          }

          // Special handling for GEO
          if (key.toLowerCase() === 'geo') {
             if (version === '4.0') {
               // Ensure it is a geo URl
               if (!val.startsWith('geo:')) {
                  const parts = val.replace('geo:', '').split(/[,;]/);
                  if (parts.length >= 2) val = `geo:${parts[0]},${parts[1]}`;
               }
             } else if (version === '3.0') {
               // Ensure it is a semicolon separated list
               if (val.startsWith('geo:')) {
                  const parts = val.replace('geo:', '').split(',');
                  if (parts.length >= 2) val = `${parts[0]};${parts[1]}`;
               } else if (val.includes(',')) {
                  val = val.replace(',', ';');
               }
             }
          }

          if (key === 'n' || key === 'adr') {
            // Reconstruct array into properly escaped string instead of using library array since it struggles
            if (Array.isArray(val)) {
               val = val.map((p: string) => (p || '').replace(/;/g, '\\;').replace(/,/g, '\\,')).join(';');
            } else if (typeof val === 'string') {
               // Do nothing; it'll be handled as raw
            }
          }
          card.add(key, val, params);
        }
      });
    }
  }
  
  return card.toString();
}

// Update contact
app.put('/api/contacts', async (req, res) => {
  const { id, parsedData, etag } = req.body;
  
  try {
    const credentials = getCredentials(req);
    if (!credentials) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const serverUrl = process.env.CARDDAV_URL;
    if (!serverUrl) {
      return res.status(500).json({ error: 'Server URL not configured' });
    }
    
    const vcardData = reconstructVCard(parsedData);

    const client = new DAVClient({
      serverUrl,
      credentials,
      authMethod: 'Basic',
      defaultAccountType: 'carddav',
    });
    
    await client.login();
    
    const response = await client.updateVCard({
      vCard: {
        url: id,
        data: vcardData,
        etag: etag
      }
    });
    
    res.json({ success: true, response });
  } catch (err: any) {
    console.error('Update contact failed:', err);
    const status = err.message?.includes('Unauthorized') || err.message?.includes('401') ? 401 : 500;
    res.status(status).json({ error: err.message });
  }
});

// Import contacts from vCard file
app.post('/api/contacts/import', async (req, res) => {
  const { vcardData, addressBookUrl } = req.body;
  
  try {
    const credentials = getCredentials(req);
    if (!credentials) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const serverUrl = process.env.CARDDAV_URL;
    if (!serverUrl) {
      return res.status(500).json({ error: 'Server URL not configured' });
    }

    const client = new DAVClient({
      serverUrl,
      credentials,
      authMethod: 'Basic',
      defaultAccountType: 'carddav',
    });
    
    await client.login();
    let addressBooks = await client.fetchAddressBooks();
    addressBooks = filterAddressBooksByUrl(addressBooks, serverUrl);
    
    if (addressBooks.length === 0) {
      return res.status(400).json({ error: 'No address books found' });
    }

    let targetAb;
    if (addressBookUrl) {
      targetAb = addressBooks.find((ab: any) => ab.url === addressBookUrl);
    }

    if (!targetAb) {
      // Try to find a default contacts address book, otherwise use the first one
      targetAb = addressBooks.length === 1 ? addressBooks[0] : (addressBooks.find((ab: any) => 
        ab.displayName?.toLowerCase()?.includes('contact') || 
        ab.displayName?.toLowerCase()?.includes('kontakt')
      ) || addressBooks[0]);
    }

    // Split vCard string into individual cards
    const cards = vcardData.split(/END:VCARD/i)
      .filter((c: string) => c.includes('BEGIN:VCARD'))
      .map((c: string) => {
        const startIdx = c.indexOf('BEGIN:VCARD');
        return c.substring(startIdx) + '\r\nEND:VCARD';
      });

    let successCount = 0;
    let errorCount = 0;

    for (const card of cards) {
      try {
        const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.vcf`;
        await client.createVCard({
          addressBook: targetAb,
          vCardString: card,
          filename
        });
        successCount++;
      } catch (e) {
        console.error('Failed to import a contact:', e);
        errorCount++;
      }
    }

    res.json({ success: true, imported: successCount, failed: errorCount });
  } catch (err: any) {
    console.error('Import failed:', err);
    res.status(500).json({ error: err.message || 'Import failed' });
  }
});

// Export contacts to vCard 4.0
app.post('/api/export', (req, res) => {
  const { contacts } = req.body;
  
  if (!Array.isArray(contacts)) {
    return res.status(400).json({ error: 'Contacts array required' });
  }
  
  try {
    const vcards = contacts.map((c: any) => {
      const parsedData = c.parsed;
      parsedData.version = '4.0';
      return reconstructVCard(parsedData);
    });
    
    const vcardString = vcards.join('\r\n');
    res.set('Content-Type', 'text/vcard');
    res.send(vcardString);
  } catch (err: any) {
    console.error('Export failed:', err);
    res.status(500).json({ error: err.message || 'Export failed' });
  }
});

// Create contact
app.post('/api/contacts', async (req, res) => {
  const { parsedData, addressBookUrl } = req.body;
  
  try {
    const credentials = getCredentials(req);
    if (!credentials) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const serverUrl = process.env.CARDDAV_URL;
    if (!serverUrl) {
      return res.status(500).json({ error: 'Server URL not configured' });
    }
    
    const vcardData = reconstructVCard(parsedData);

    const client = new DAVClient({
      serverUrl,
      credentials,
      authMethod: 'Basic',
      defaultAccountType: 'carddav',
    });
    
    await client.login();
    let addressBooks = await client.fetchAddressBooks();
    addressBooks = filterAddressBooksByUrl(addressBooks, serverUrl);
    
    if (addressBooks.length === 0) {
      return res.status(400).json({ error: 'No address books found' });
    }

    let targetAb;
    if (addressBookUrl) {
      targetAb = addressBooks.find((ab: any) => ab.url === addressBookUrl);
    }

    if (!targetAb) {
      // Try to find a default contacts address book, otherwise use the first one
      targetAb = addressBooks.length === 1 ? addressBooks[0] : (addressBooks.find((ab: any) => 
        ab.displayName?.toLowerCase()?.includes('contact') || 
        ab.displayName?.toLowerCase()?.includes('kontakt')
      ) || addressBooks[0]);
    }

    // Create in the selected address book
    const filename = `${Date.now()}.vcf`;
    const response = await client.createVCard({
      addressBook: targetAb,
      vCardString: vcardData,
      filename
    });
    
    const newId = new URL(filename, targetAb.url).href;
    res.json({ success: response.ok, id: newId });
  } catch (err: any) {
    console.error('Create contact failed:', err);
    const status = err.message?.includes('Unauthorized') || err.message?.includes('401') ? 401 : 500;
    res.status(status).json({ error: err.message });
  }
});

// Delete contact
app.delete('/api/contacts', async (req, res) => {
  const { id, etag } = req.body;
  
  try {
    const credentials = getCredentials(req);
    if (!credentials) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const serverUrl = process.env.CARDDAV_URL;
    if (!serverUrl) {
      return res.status(500).json({ error: 'Server URL not configured' });
    }
    
    const client = new DAVClient({
      serverUrl,
      credentials,
      authMethod: 'Basic',
      defaultAccountType: 'carddav',
    });
    
    await client.login();
    
    const response = await client.deleteVCard({
      vCard: {
        url: id,
        etag: etag
      }
    });
    
    res.json({ success: response.ok });
  } catch (err: any) {
    console.error('Delete contact failed:', err);
    const status = err.message?.includes('Unauthorized') || err.message?.includes('401') ? 401 : 500;
    res.status(status).json({ error: err.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
