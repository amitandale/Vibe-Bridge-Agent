# Context Packer (BA-32)

## Env
- `CONTEXT_PROVIDER=fs|llamaindex` (default `fs`)
- `CONTEXT_CODE_PROVIDER=cody|none` (default `none`)
- `CODY_ENDPOINT`, `CODY_TOKEN` used only when `CONTEXT_CODE_PROVIDER=cody`

## API
```js
import { pack } from '../lib/context/pack.mjs';
const res = await pack({
  repoRoot: '.',
  query: 'router',
  budget: { maxChars: 200000, maxFiles: 50 },
  redact: async (txt)=>txt.replaceAll('secret:', 'REDACTED:'),
  retriever: /* optional Cody adapter */ null,
});
console.log(res.artifacts);
```

## Installer
Run `bridge-agent/scripts/install.sh`. When `CONTEXT_PROVIDER=llamaindex`, it installs `llamaindex` on the host.
