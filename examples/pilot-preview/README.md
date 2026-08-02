# Preview pilote Revaloop

Cette fixture simule un outil métier crédible avec uniquement des données
fictives et volatiles. Elle ne possède ni dépendance, ni base de données, ni
secret, ni appel réseau sortant.

```bash
npm run dev
```

Ouvrez `http://127.0.0.1:3000`. Le même dossier peut être choisi comme « projet
local » dans le compagnon Electron Revaloop : son `package.json` expose le
script `dev` attendu.

Pour simuler une correction tout en conservant la même URL de tunnel, arrêtez
uniquement la preview, puis relancez-la avec :

```bash
npm run dev:corrected
```

Consultez [`../../docs/FIRST_CLIENT_PILOT.md`](../../docs/FIRST_CLIENT_PILOT.md)
pour réaliser la boucle complète avec une cliente.
