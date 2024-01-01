# nostr-relay

A simple nostr relay written in TypeScript.

## Getting Started

```bash
git clone https://github.com/rrainn/nostr-relay.git
cd nostr-relay
npm install

cp config.example.json config.json
nano config.json # edit config: see https://github.com/rrainn/nostr-relay/blob/main/src/types/Configuration.ts for information about how to setup this file

npm start
```

## Implemented NIPs

✅ Fully Implemented

⚠️ Partially Implemented

- ✅ [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md): Basic protocol flow description
- ✅ [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md): Event Deletion
- ✅ [NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md): Relay Information Document
- ✅ [NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md): Event `created_at` Limits
- ✅ [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md): Expiration Timestamp

## License

Copyright 2023 rrainn, Inc.
