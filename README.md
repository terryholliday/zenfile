# filezen

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## Smart Purge Logic

The `docs/smart-purge-rot.sql` script captures the rules for identifying "rot" files during a Smart Purge:

- Flag files in known junk folders (e.g., `AppData/Local/Temp`, `.cache`, `node_modules`).
- Mark abandoned screenshots older than six months.
- Catch ghost files that have a size of zero bytes.
