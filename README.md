<h1 align="center">
  <img src="/public/who.png" width="auto" height="48"/>
  <br>
  Who Contacts
</h1>
<p align="center">CardDAV web UI</p>

---

## Who is it about?
It's about your contacts! Self-hosted CalDAV / CardDAV servers are plenty (e.g. Baikal, Radicale etc.). Using DAVx5 they integrate wonderfully with mobile devices. Using clients like Thunderbird they are easy to manage. There is a reasonably modern and functional web UI for the CalDAV part, AgenDAV. But there simply is nothing for the CardDAV part. The only one that exists at all is InfCloud, its last update was over 10 years ago and I wasn't able to get it running properly. Which is why I made Who Contacts.

## It's an early release and was designed primarily with AI, will it keep my data safe?
To be honest, I'm not sure. I'm still testing myself and I hope I have caught any issues that might lead to data loss. It should be safe but please make sure to have proper 3-2-1 backups in place in case there is some unexpected bug that might lead to data loss. I run Baikal and I habe been using Who Contacts with it for a while now without issues.

## Screenshots
todo
]
<p align="center">
  <img src="/images/light.png" alt="light" width="48%"/>
  <img src="/images/dark.png" alt="dark" width="48%"/>
</p>
]: #

## Setup and installation

### Docker setup

You can simply use the following docker-compose.yml to spin up you know Who. It's stateless, just like AgendDAV no volumes or bind mounts needed.

```yaml
---
services:
  who_contacts:
    image: ghcr.io/h-quer/who_contacts:latest
    ports:
      - "8842:3000"
    environment:
      - CARDDAV_URL=https://sample.carddav.server.com
      - COLOR_SCHEME=system
    restart: unless-stopped
```
Once it's set, simply pull and start the image:
```
docker compose up -d
```

Who Contacts will now be available to tell you who is in your contact list (8842 in the example above).


## Scope and roadmap

I'm using Who Contacts daily so I plan on supporting it long-term. I also want it to be fully vCard v4 compliant (and v3 if possible) and to fully work with all self-hostable CalDAV/CardDAV servers.

## Future plans

- General bugfixes to ensure this compatibility
- vCard export
- Supporting TYPE:group and TYPE:org entries (currently those are ignored, only TYPE:individual can be edited)
- Improved support for custom fields (currently existing ones should be readable as well as editable, but new ones can't be added)

## How to contribute
Bug reports are always useful (if you run into bugs, which of course I hope won't happen ...).
