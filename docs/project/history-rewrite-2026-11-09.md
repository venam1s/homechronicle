# History rewrite — 2026-11-09

On 2026-11-09 the whole git history of HomeChronicle was rewritten once, on both
GitLab and GitHub. Only commit metadata changed; every commit's file tree is
byte-for-byte identical to before (verified for `main`, `ui-redesign` and all 43 tags).

What changed:
- Author, committer and tagger identity → `venam1s <270240970+venam1s@users.noreply.github.com>`
  (previously addresses of the suspended `havuq` GitHub account). Dependabot commits are unchanged.
- AI attribution trailers (`Co-Authored-By: Claude …`, `Claude-Session: …`) removed from 21 lines
  across the history. `.githooks/commit-msg` strips both going forward.
- Consequently every commit ID changed and all tags were moved in place to the rewritten
  commits. Tag names, releases and published Docker images are unchanged.

Older documents, changelog entries, issues and notes cite pre-rewrite commit IDs. Look them up
below (search for the short ID — it is a prefix of the full old ID).

If you have a clone from before this date, re-clone (or `git fetch --force --tags && git reset
--hard origin/main`) and do not push old branches — they would bring the old history back.

## Old → new (1160 commits, oldest first)

```
date        old                                       new                                       subject
2026-02-20  72378a5ad0916cf545f323d00dc413f11e53dafe  97962b565042e8436ad429ef559ed12415d63ada  Rebrand to HomeChronicle + bulk pairing UI
2026-02-20  7c7ea24cc4a2cc4e68e2e81cad946dd0ec59a7de  3322782b4f60e44ed9fe078c8c648f1e0b902c0f  Add Setup tab — in-app accessory discovery and pairing
2026-02-20  9e977526c7d28ee418e702aab443f5d83b4bf5ba  66374c05b795956a3ca00c8f4d5837a93c587308  Initial commit — HomeKit Event Log
2026-02-20  b99b08798ad86fd5ca6203e135fdafed4171e58f  5e7b9569135fe28b10c573f4bef4f8ac6be41ae6  Add Homebridge bridge pairing support
2026-02-20  cba94da8c06e45035134cb44dbe27c70b4539444  e3b93d3a9ba6fc64501a1429df02ed3b42a0cd3d  Add PIN help guide, PIN vault, and better pairing error messages
2026-02-21  2511f1e0dc96d7e0597dab127279c1cbc8d47756  dced568ffc0d9727013fce64afb9693973ece939  Add app icon, tagline, and update README features
2026-02-21  276ad82ad85108fc7addf6f8d4649bdc20234ac9  eb572e2c1b1493a43dd54a62a379ddd0fcd45e93  Fix room name input reset mid-typing (hyphen bug)
2026-02-21  29f822e49203b8a6c25a45d268381f5786d08769  c5c14792dd6efd9210106c58176ffb8a45af2530  Improve Accessories page: auto-refresh, richer display, bridge info
2026-02-21  2c9140e77ecb8fb20ef4f868ce13ff3ddcbbb64f  36e424cb29efdd1c2d9d0ac3fd305409593f4a4e  Add delete pairing button and fix Accessories tab showing paired devices
2026-02-21  3b522bbbdd136ba016a1a89e5cbaf7f3d15d641c  26a2b76742d3dbb0d3284375411b8e2f8645e137  Debug event delivery: expand watched characteristics and add diagnostics
2026-02-21  7d8fe47353ba5f2bebc65009a898c33a1a840f48  dd9880ee50537476b6ef28d26a013eb2c8750ff0  Move PIN info box to top of Setup page
2026-02-21  80d8655e6bc5f3235563afa9e3f1845743153da5  589f87a4c10938a0eb5a119dc644b180f37734d9  Add bridge child-device discovery and per-child room assignment in Setup
2026-02-21  a799d4b7e9afb4c5ee66b098daa65d3800620a26  6fc63885a29ca2c81be1eb1dd6a2b7c0498a34cc  Fix: attach event listener to client, not subscribeCharacteristics() return value
2026-02-21  e01b139004e66268cf0692c40766a393fb1229e5  83111cc744df477792bde2cf4dad24d888352546  Add timeline auto-refresh, room names, service type labels, and Danger Zone
2026-02-22  1f3168c670066ef746d25d6f6bfabd5e089573b3  9c8e038f6b747236392d68ac5717f6278e7222fd  Rework heatmap UX: hover highlights in place, click to jump
2026-02-22  284bba3731c47fee65f8745cd47dcd394c9079f9  cddd89d5aacd2e7c18a95c813797c789c0150cb3  Add rich timeline metadata, mute, scene grouping, and heatmap features
2026-02-22  2ae4ec4124952bd599da413a727196df7a9cb881  59d6c682287e899e8615b7319472719e773b56fd  Improve error logging: show full error not just .message
2026-02-22  b84c2c1c0536184cb54b4b32ed7ad1d88b1485a8  c724826b5a234db45a7ba9207cc7aaa4c880775f  Fix heatmap click-to-jump across timeline pages
2026-02-22  ee78af9857750d9b9db625c092cd7d512da1dac2  258836ad48abba9cc6802396d3515207ad195c90  Fix: don't crash when DISCOVER_IFACE doesn't exist on this machine
2026-02-24  1bbd45ba56a779cb16e056cd87dbbd48a3d42b46  9ffd7d4bb805833faf21098cd7865da55b2b400f  Update .gitignore
2026-02-24  2f234553967d526b971afa6b723412cc2790c178  c0c4c0dbfb1fd4491936c1858510bc5e442e8f53  Dashboard overhaul: new components, 2-col layout, UTC→local fix
2026-02-24  37bc349d53a788bb0a02aebc0d27a5b9f45c9441  ffa3f5ccec1b948c4b4c41442230634f5f447cb2  Fix web→listener routing: use host-gateway so Nginx can reach host-networked API
2026-02-24  4d90898f720dc70d8d03176424ac209b5dacf7fb  0d91eefd87dceb119a052eaa5b81711590d16f1e  Remove .claude and CLAUDE.md from tracking
2026-02-24  560fd97fcb6a8f7accde423fa0ccb57ec18533e9  58bca675b05279649bf8578f2032c543e4d4ba1f  Add MIT license
2026-02-24  72e5843befd1b7496d77e1ba4e6fd012573fb86e  6f7ccc95847a64fb6abcfbd33184f799b8e3dba0  Auto-migrate schema on startup so init.sql mount is not required
2026-02-24  74745f76405d9149332a8a2be8b3055a27fa480e  b9a96f743a5200ebefb0d5288c06d401ec54a4d5  Fix network definition: declare bridge locally instead of external
2026-02-24  84e99ab26112647255bd8959bf507d1e1491a0a9  177bc2c7e8d4bebcb716eab1f9246c14299b3bff  Remove local build directives from docker-compose, pull from GHCR only
2026-02-24  92d1e6c67f53a9e5b23fc040ce06a4726c035357  574b609b105e99b88c80e420e4bfdfc5cceb8ac0  Fix heatmap highlighting, bridge room inheritance, stale port recovery, and add GHCR publishing
2026-02-24  a9a7b6c6385d77c5406e93a76d82f92a05d9cd17  5833c2636ab138872771b02a1c13fbd3d9613ca2  Clean up .env.example: remove DATABASE_URL and VITE_API_BASE_URL
2026-02-24  b4b29cff28d9b98553710788f8ff21d4e0e8de29  c51f51ded0e527bed90755cae83958a75f9becb1  Fix docker-compose for NAS deployment: expose postgres to localhost, start_period, my-network
2026-02-24  c7509f45d3071309d0d64d6d5d20cd6175eb22f3  e5c802121fdb176a3fc4466e59cfbc2143e146af  Fix postgres port binding: bind to 0.0.0.0 so host-networked listener can connect
2026-02-25  1df386c022f6adaf90431a3f0392841931113908  a66f59618e1bc117790a0df5d492d7a99854aba9  Fix Postgres immutable index migration and harden query param parsing
2026-02-25  227158c9a5c6668cb9921260ba9500155a0ef70f  c2f3d1c7e289f1b7f70e309200f3f312dabccab0  release: v0.1.0-beta.9
2026-02-25  2afa93d764d86f81c9cab4564fd138e09c28dfac  86d16490624c541e4b8aa3cf3cf170a3a27bc0fa  Make timeline search panel collapsible and improve filter/heatmap discoverability
2026-02-25  3026832e5922742e822c56bcf77bd4ae26b5247e  e793998ba482ff06649a8db845711c7d4157b619  Improve run-cycle completion signaling and component-level event labels
2026-02-25  3c1d2e4a004f77517cf34e744d71f6c63012d9fe  74fdd562693f32a0a9e143cc2cba7b1caeff320d  chore: ignore listener local runtime data
2026-02-25  55186505707dbebb0b8a810238e58b4eb63b3a98  f3845dd70cb0cf7fb16dbd7e29b5363c1661d284  ui: refine theme controls and header icon alignment
2026-02-25  91fa62aacf727396f83b5d99537d3ea046ad55e2  2b5bffdf1ca8c9646a70b160b194bba7a8c44cfb  docs: add production install and upgrade guidance
2026-02-25  cdff800f80f05afc763136804e0cb9c03006e359  edf2aebc542ca927b0dea21c3ce70280270b99c5  Fix nginx template rendering for empty API token
2026-02-25  d78da9eaa9d92d398f0ede008d142a310d448a00  82a37fb3f3bf5391a1e936ba52be10ba12b7f777  feat: add scalable event querying, retention, and test coverage
2026-02-26  07d3c89932fb4dae98a0ad873e241ede62748e52  fb9d07970bd83320581e1f7b35eb43eda3d08ee6  feat: sync UI and health updates for parity with local builds
2026-02-26  0f7d8c4016583f8dd0d0f06aa60fd682d5055778  b76b5ce535499b700e3a34016990c8983916d025  Add setup retention cutoff and improve dashboard hover details
2026-02-26  1e3aefcc27667181b9a6a25a3316e95e43a6d810  c4a0fb645b2f5db8d6e40f1d476558841ab0f612  feat: add accessory metadata, capabilities API, and reliability stats
2026-02-26  1edaa5422ab05e092d12249e798bcbf33c676b1a  6ae2b3e1ac028b4898c2c880e95ec42813d62a27  Add alerts engine and alerts API routes
2026-02-26  547285762a22e41917a2895a31fbdcddea97f163  62f233bb43c5b613cc45e1704f3720ac7d1909f1  release: add ALERTS_ENABLED feature flag
2026-02-26  565defc092c3099d4335eb53ff6a2a81783b042a  a544571e92b12c818dd39bd25f2f036e93b9e289  Add Alerts tab with rule management UI
2026-02-26  5f9746911f8657bbe654e3f43b0b518745fce2f0  88a5b6e76c93faa26043bed01fbe22e9165fed9b  Merge pull request #8 from havuq/codex-sprint1-alerts
2026-02-26  65fa5a388376d066500ed291f4b20cdc82959811  e6df633d3f95390fee679c2aade30ed020a5b915  Add monthly heatmap and improve stats time windows
2026-02-26  9671f7d4bd3bedc0ed87a1d62f2401a140914c58  ca4db8f8125a4f0d778c6c391a389d08dff76f2d  Add GA exit checklist issue template
2026-02-26  e67c507032a68a3cb957e598c4d8b77ef1156c63  9c6bf93f2f645721b4b72917c079e0ec5234bc73  feat: add anomaly detection and device health monitoring
2026-02-26  edca7593d1c35fa4615d3a87a246e13db63c3f96  327da3a9b5cfcf1669163beec75ad563a7cd9554  fix(web): ensure theme control layers above color picker
2026-02-26  f3b36eab7f730b3a3d9baa55d86fc4805619dfed  828cb0c71b20fe9743652cb7aa53f07c77fa7a52  release: defer alerts and disable by default
2026-02-26  fdb8c5a7e9e5e02562c82b9a188ae8c60d08bf4c  316c2b326ca1a56da1262879e0f88c9c779e81db  Document alerts configuration and API
2026-02-27  19c9a01dd8a906f17a6f733247fda384b67e3cf0  0874d5833adb8bf3a6b72f960c3e9da2cc631e1c  PWA UX updates: bottom nav, icon handling, local docker build override
2026-02-27  33e4f3c0f5b527243ffdfb8d1ee55bba59602381  a9449cb53a6aed9d0311748ae9cc65e8aed38c65  release: v0.1.0-beta.24
2026-02-27  40526944b37bef0b0348f7c6175883ce57275fa9  ec017ee26a5faf66d40ee9c6fcd1e9d7e58cd04c  Refine timeline panel and remove weekday heatmap scrolling
2026-02-27  c0a86b65796a8f2b3b42698ad23d5dd0d522d3ec  963fa8d9ec79f50ff8084e5c0d1fd1c734a22622  feat(web): add PWA support and mobile install docs
2026-02-28  647c6bee71096e24fa921e63c4317913e167f882  d5995a3d9d30094895bbc8a9b36a5d09eceeb30d  Add branded header logo and harden timeline timestamp handling
2026-02-28  bc2047a6c9823721bbf5291fa293ac9a55763e24  8c4528c30ad068d65b083f5b9dfcbf3c715fdb8a  Refresh PWA icons with text-free logo mark
2026-03-01  049c3acf522e2ee4da76f9c753f79eccb269672a  c11c03f59aa96b24a7edc7f164de6ca06d47ff8e  Add docker compose snippet to docs
2026-03-01  0d5edb2acb09de04665e2e77e4bc35ca53d14593  6b92f3dd12653a2ef8a64820e0a991c6b8fc7ecc  Revise README for simple install
2026-03-01  113c7246acc4e8dd5115a323423dd3ba57c2c917  4c074b3fa9a689a36c0a60a240a95a5449b75513  Add tabbed layout to get started
2026-03-01  1aba48b853352d61767db63611581690da2e33d6  d55d31831cc1980692220a439ecd94575a2fad05  release: v0.1.0-beta.27
2026-03-01  1ee7421c9060a0c5b88158bb2dcc2664012e4765  c68f78b11c5dfc472c50099325a82c638e422bac  Fix docs site: stack manage screenshots, rearrange dashboard grid
2026-03-01  2af0ef312f4ea6a2a5fcd7111d134349a5e6ed36  9effaf7ef2b2efd147985f0d295d453b787163e8  Create FUNDING.yml
2026-03-01  3989420c3f19865d2fb1684e1d758080001cf874  a8c4ce3a7207393fd6171bc60bba68104be883c6  Fix og:image to use absolute URL for social sharing
2026-03-01  5398fba04d1164354c5c98f7701a03dd28ff550d  778e26d203064eaafa32087dbd5e27ff18c0622b  Update CNAME
2026-03-01  7cc0a97441e074cd5e3db48db1bfc5e6aeacb239  546582706a8c192ccbb5e9a788bbbe9dd4fec2b9  Update screenshots with corrected branding
2026-03-01  b9427d93f8829a6253f222e82d86ae6871d094f9  c5a57c2fbdc797841cf22a66b88bacfe6fc9d8cd  Add command-driven Matter commissioning runtime and polling
2026-03-01  d4c7e60613cbcba7910a63deb4688c13595c6c37  112361b0b33615de24e0138e4eac8335c4ad984a  Clean docker compose config
2026-03-01  df9250abdfd758bc54117efe0efc2745575970b1  4568279edf8bc0d57e4065c495fd49a3a1185cee  Create CNAME
2026-03-01  ebc7c1e3430a27fa221f198dbd7ded0404de406a  17fea4f1c92712b21e916734c8fef0e1d3150840  Add initial Matter pairing and event ingestion support
2026-03-01  fca037ddbc7bd653c12f2f73b7902e924781be59  e0454ea96155f04150a6e881de86837f6c4d2df7  Fix web-to-listener API proxy settings for Portainer/RPi deployments
2026-03-02  244f91b0b9ad495abd18a72c136a96cdf199d678  45e18857bb24a76baba8171584eb4fc1421b579d  Add --bypass-attestation-verifier and Docker CLI for macvlan setups
2026-03-02  30989e9adcf9c4292fd385ea04da1414b2f1be93  70577a1accdbf19263ad932aaa5679b8422878d0  Review Docker compose setup
2026-03-02  326cbb4e5d71e601f1c3f9e44e4f586f2d5f4af9  2a28aea482861dfe275377a2f9d5b8f1658960cd  Merge branch 'matter': Matter works out of the box
2026-03-02  68f8d75e3f4633cfc737dd05a021f07f591a105d  e5b836cb8231981888697babd3d1b91eab69d77b  Merge main into matter and resolve README conflict
2026-03-02  72e8e0a70e3a454da9355a12642ba5778e34131b  284cd444b49560a2ce7eebc81cd10c0b2f63a4e0  Fix Matter commissioning timeouts for end-to-end UI flow
2026-03-02  7fcd6d8d7035cc6c0e08d20da735b67f58e020de  d77e28231fed4ca2fcfc43ea90674dff9ab02df7  Surface chip-tool error details in commission failure messages
2026-03-02  84db53bcec94b204021ffd652e3a2227161ced12  82eee554e75d2500b32e97016b8e607f27ca5796  Update PIN help modal to reference Homebridge Primary Pairing code
2026-03-02  8f4b386827bf05f1865c064d27d94abd1482ac54  fd87123f063793fdb74f3fd00d239781e7f57e63  Make Matter work out of the box with sensible defaults
2026-03-02  9fd72e5df9d472ced6155b02f444c5b9407300ca  91832329a862909468c6b1e2c79e109b0052f275  Update README.md
2026-03-02  a99e6d7cb76667434a62c679fdb4af88305eedf4  4cd0578aae80e998842fd3c8a594a82888dc1752  Bake chip-tool into listener image, eliminate Docker-in-Docker
2026-03-02  b5e4a9ea8bd94d4d025e8153853754f038c105ad  50caad36b44845722f10b53c27f43b30b6847ce4  Fix Matter commissioning for numeric manual pairing codes
2026-03-02  b6c48b724a45ce1afb930ded91e1b5dee4b27b04  3ec2a75213f075f4390de93dfd6839441ce431b1  Add chiptool scripts, auto-generate nodeId, and refactor Setup UI
2026-03-02  dfaa65d530255386e612c71a60e595d6848fb805  430e31941f96f22e485a1fe1152b7b2fc0e0ac53  Fix GLIBC: use node:22-trixie-slim for chip-tool compatibility
2026-03-02  e64a93126a7ec7076d71e48f9e38cc5c2ec9763d  67622009e5cb6fcff02a7a6178de1f548bbdc4de  Fix GLIBC_2.38 error: upgrade listener base to node:22-slim
2026-03-02  f576b962aeca0da9a42cde60c6824ecd6dc09464  c94210669263253e2a350f41a9682982e2f73869  Merge pull request #10 from havuq/matter
2026-03-03  112e9ba1f75b218d78156473990d3ad69a4bb518  1c0ae272b49baf39b4eea33a982decb7a462035a  Add named-read Matter polling fallback for chip-tool variants
2026-03-03  166333fae096c993e51b86185f4566e5a8ea8f78  6feef8d2f727a466259018b932d6c5db2d4f85a2  Handle chip-tool Attribute header format without colon
2026-03-03  1af1c8cbfde8c22e6455acc91857e7a63c68b819  d3abcf7e76f70d6d2844339d643066f1bab0c92b  Improve Matter reliability, setup UX, and deployment docs
2026-03-03  1e3fde2ca21f148ed97705d78fcf34eee4004137  2bbd2339e0216187d81fc2436ad451ec19ba1be4  Prevent discovery scan failures from crashing listener
2026-03-03  3b6cd636e38c36062dd850e07a8b30a3dc6dcdde  0c7a5d05a43bd534d90c7d9b86b0de94d1b575ee  docs: simplify env example and add full env reference
2026-03-03  3f0d9f38ad72701e020ec5cb05bf3db5ecac2903  a4b7acccba6e1707aa0f2e9764a03acaf778e7b5  Fix room placeholder escape text in My Devices
2026-03-03  47b0da1cbf45cbf683d7fda2f14fcd834cb4b073  0c1ac06db2918353e9b8f845c32f5b591332b354  Handle recoverable Matter FindOperational timeout after NOC
2026-03-03  4af74eb2910bbcb7ed27a4b1bb6f20b3ec07e55a  fbccdffa312c4229dca888bf5eac815777d25303  Fix Matter poll fallback on CHIP invalid-argument failures
2026-03-03  6a7aa11faa7dcbd871dab1475a6f7b88123ecac9  18426d1a5ce312ce5a2cc52b8ab8aa3c69050162  Use host D-Bus socket for reliable mDNS discovery in listener
2026-03-03  713092425378419752867757dea4428dcd28c42f  a4368cb9dcb24d4c4d5bb28a9ad3759bd2fe414d  Improve Matter poll compatibility across chip-tool endpoint arg variants
2026-03-03  81e68ee16e2b6c8f59194f23cbe1477447beed22  5bb1fbe771506c407e56cbd3eb2e604da7ab63df  Add Matter subscription worker mode with streaming event ingest
2026-03-03  9905065f494935b8948c1cb8cf771de466968e8d  a7c2b7812fd2fb3e73f77bfa8ba80b2eb590b75d  Add Matter network scanning to match HomeKit discovery flow
2026-03-03  d91670c669104eb19e0d49758baa26a1aaaaea46  d22307c49e4b14d3da4e06b58d64def23763e069  Fix chip-tool argument ordering for poll and commission
2026-03-04  631ef9800ad8fb6d0d5c073906c0c3c446927cb5  895c66ce1fa5762fab2896ff3112b4b71fce0e6e  Replace chip-tool with matter.js for Matter controller
2026-03-05  051b2fbedb523fd28db815b8d9531e2de903d410  565bfc9dcde63e1b3a5d30f299f05255f164adef  release: v0.1.0
2026-03-05  096f46cbf7440d4981afea4afd57b2646a7c67b0  dd9329eab19b22f870dd766b2d898208b5f234a9  docs: expand GitHub Pages setup with embedded compose envs
2026-03-05  0baa25dadd76e63a6ae44d91e3a7f000592c3e39  48f11e2d0e975036aa6137d8104217bcd7f0699c  Fix Docker build: add build tools for matter.js native BLE addon
2026-03-05  14cbdb991ef5e61f37a5a17edeb0a22523b98ec7  90ca6304aa809f22e6b753432513c3291740d10e  feat: harden api security and add prerelease/ci gates
2026-03-05  188a779886b5f510dda76e9d3c5ebcb35c732060  ecacefb67010fcdbf3160706e522f50149842b20  fix: trigger container workflow for prereleases
2026-03-05  329379b91080f41339897a8db374fa6c02a6fc98  3b8d1364dacd64f87f72b15e4265dae9b5b22fdb  Add copy button to docs
2026-03-05  335dc2b5b2aa8a84fe750750c25edea56d2227a6  83c56b39ba592188b6a45bdc3f1c5c9777d18452  docs: update readme, limitations, and UI for GA release
2026-03-05  415c00a549e3266119d8ce03b7e1c0b2c6d6db22  bcf8065a867d1a1ed954c07dc1cd2f26032f6f2c  Refresh HomeKit pairing data
2026-03-05  7227011db0532e7df1f3f966d15c679326834794  6ddeef28110d1497691c9d652631de2f46059b55  Highlight selected add-device rows (#32)
2026-03-05  83bf834384e30608d2ddbe877911b655d9132fcb  d0b379721d6818f912ef124c1e2134171b68fd58  Add GitHub security baseline (SECURITY.md, Dependabot, CodeQL, CI perms)
2026-03-05  935b8485b07fc7e995951e23106e526fbda122cb  b9b6c1e61c245e29acbf20a32dbd2f1b7fe300a3  fix: listen to all publish-style release events
2026-03-05  ae4103ddb4624dd4168a7ef3010d59b989aa74d8  0225261f42035106ff2498e859588f2b5e9f9e6d  Evaluate enabling HTTPS for AP
2026-03-05  ae8e87c1c7d336493dc2f96333c780ccf98cf92b  68570947eacfc9125413c624ffe326a460163005  Prepare Matter beta prerelease
2026-03-05  de6fb8ac88237e5f1eaf19b097f2978cf5bf79d8  c2ac00dcfcbef17a1071e083a51d2cf973e909c6  Fix Matter node ID mismatch between controller and pairings
2026-03-06  05b5893cb6d6a02f336f5ed271819d3ced072014  1049f2cf79bc3c2e30163d45cf0b5d660458aeea  Bump react from 18.3.1 to 19.2.4 in /web (#37)
2026-03-06  21d490fbc93aa9365791a2553b16c84b9843a51b  d540c52b2beafa8790cb2836abf2353e5f8071e0  Add Portainer compose example
2026-03-06  443695f55fc0f33a4ca1e5479ab1fb187541ae6e  b6fa4d1b958de1bfb6f30832d7cb1bdaef74bbfd  Bump the github-actions-all group with 8 updates (#36)
2026-03-06  52ed2d08602c83fc9b2ce79813e00c61a00ca933  b67dfd19e98f04e8a63e6432164186a40e173749  Bump pg in /listener in the listener-minor-and-patch group (#34)
2026-03-06  570df0070bd9e05bcee44765149310d4bdc17f88  acc1141ed4f51aff6422b5a4ef1de8e20cde8bbe  Document listener host fallbacks
2026-03-06  682fd507b8ecdb3ce6af93ee98c9303f9ae1a630  db3d2d185606947f9747336807ccb664ef6b838d  Bump the web-minor-and-patch group in /web with 3 updates (#35)
2026-03-06  6c0f8eb616969c28e04af14de2fb24eaaf393555  4b9941b957de87e18ff2c160fbf56634c003e391  Codex/main sync dependabot docker (#33)
2026-03-06  8704ed266edbfd735d7116dc787908c8c1e826ea  eeaeea98a0c94e931a53d8093e160f47d50b906b  docs: fix Portainer git reference format
2026-03-06  8f0e457608e06e0fdbd1aafcbf774f4af8a8e2c8  1561142d623f0ad28610673a6b44d0c39e93e4b5  Update docker compose for Portainer
2026-03-06  9bf644ed6def7f9f69a07a9c829b1789e4bcc4e2  25f84d8e4439ea1b29be7ad234bda64a16dee4e2  Document pod networking setup
2026-03-06  bd737dfee38306bc1929b33775af9d8c1da2d2a9  5d1bcd8a65731e538c1525492d33e8a9a3d52019  docs: add env vars reference link in portainer guide
2026-03-06  f071a1240f5895504194e57dcd3225eb5eba82aa  65fc5884894ae9e58930a266b31bf63c86cd80eb  Review recent homekit event log
2026-03-06  f0f01fe7ed352de016bd69ab85c27559c1b26752  a6f6a0c7c31b8e762005f8f3a68a29dd31cbc056  Codex/commit all pending updates (#38)
2026-03-06  fe7bae8e9a99f22ec1b394d718046be3ba1aa790  08cc68f23506e716ce6b92970550271a5f5e0098  Update .env.example
2026-03-07  ab99c9ec8c45e011406e27abd8710a3c90e734c9  022b121686071e080252c009bbed292ce8535191  Bump express-rate-limit from 7.5.1 to 8.3.0 in /listener (#39)
2026-03-07  ae175aa14ba7ce79aeaedce752d8c12354979df1  f7b7e792a2a15dcb3ccc270bf872981a8e13029e  Bump tailwindcss from 3.4.19 to 4.2.1 in /web (#40)
2026-03-07  c8bf9b8f6db637dfaa5e7e5b2d76011362042d33  8c52fa6aabe8bfa77f934dd61c5387f220d77591  Suppress Matter startup snapshot timeline events
2026-03-09  0c8fd6bc52324cb596a909bd0679d5611d2f53d5  3fc300033f8f99703e648fcf891b755f44f5f23f  Add accessory detail page and fix local web build/cache behavior
2026-03-09  2084128ec93d8dba763f3040141618831a8837dc  ddf2d584fcb2560c5df03ab057a890509935bee8  docs(api): document archiveBeforeDelete in retention endpoints
2026-03-09  208c06c1b5fe2038a35982cd55c4fde41d9266f1  fb90ba2f0acce5b143bfc51f1ed0c803cbbf279d  Fix accessories back navigation
2026-03-10  59903bacd710c178ee4aac2e0111eadba1734115  6f272ce6d7ad5a3d02acc6f12d706f4a4cda17aa  Fix stale web cache loading
2026-03-10  b3002b8b7539ba79353380c8388059585a01c252  7db9cff497a37aa8151c3a366e071dadd0249e08  Delete docker-compose.override.yml
2026-03-11  053e0a3ed9d03f148e0effca559aa1fe69c078c0  3a4773e56aaeb163e8d86ecded11935a9cd92935  tweaks
2026-03-12  04f7c6d14d0be0c59e35dfab7e2c5d13c7ad71bb  da8ddcfa6eb6f0dfb1da7c478f693618217b3c3d  Bump express-rate-limit from 8.3.0 to 8.3.1 in /listener
2026-03-12  0f5d2750552c22692e1a8a6bd5285a155ccf87d6  b822950670f5e78aaa82c81d7b6f0cbc26e50f76  Add accessory detail enhancements: reliability, metadata, anomalies, trends, protocol info
2026-03-12  61bdc539a9f87b7e602fcb787bea71fff5b716d9  6e3c94803b7c09b8786ac7d44672a9c8d5c8dd6b  Merge pull request #41 from havuq/dependabot/npm_and_yarn/listener/express-rate-limit-8.3.1
2026-03-12  63a113c4ec5b36036d4ddf63a8348b19e3fd34b6  f92c9e170ade9f5aeebff782f53312f389d233b1  Bump vitest from 4.0.18 to 4.1.0 in /web (#42)
2026-03-13  23c2f7d5e1b598969858e828b2937814db136140  d8d8269943bc8c67baa24b8277a162cd91999288  Timeline cleanup, Matter improvements, changelog, and accent-colored charts
2026-03-13  2acd6f0912ac51fc1a409a93c37664e5e5714acd  1f28ef4c5da5bed7ddb40ee49d3fa4e9714b8562  Polish quiet hours card header and error state
2026-03-13  4ba8ad1c183c00ac41f0f92bd613ece4838bfb3b  50cd98b0b401a27ceb8ce38965b656e336d8689b  Add device notes, quiet hours, and Matter delete fix
2026-03-13  4e60ae5ba9b50cb50faf44bf59a3eb9aeccf73fe  9a189bf73106bb9477f9d20fe093f3fcd24ed499  Remove CLAUDE.md from repo (keep locally)
2026-03-13  5a0aa978c2144c2c2ed49ba3194bae94777ca129  83ed793752cbc933f2ca301ed50f56da4d9f2a6b  Remove .mailmap from repo and add to .gitignore
2026-03-13  6a80d1e76bebc72758fd86f1cc49a67b55081a0d  fba522c7e5d068d697c4d334102529780485c87a  Merge pull request #43 from havuq/dependabot/npm_and_yarn/web/vite-8.0.0
2026-03-13  72e5988f64c6eb7f6b6bf00b601edb05442187b6  3cc95159b2b9ab1a4aaf77fbcd4757f5ea56b8da  Collapse changelog entries into release tags
2026-03-13  81bd0f9724762f0def83504ee79dba6e49e878e9  f5484b669f6d02084b6316fd1822869446bfd641  Clean up repo: remove duplicates and internal files
2026-03-13  9d3fcc6935feb0396bd15d83c2a7dec19eb9323b  b8f5f4fcc9344c16879f81ad661ae3dfd6cbaf65  Add update available indicator in footer
2026-03-13  a4f39ba3b649b075f2cfc49fe2eff96795bb7659  fce063391ec32d30e68dfddcc204647d1b9c5182  Improve pairing UX: friendly errors, PIN clearing, room hints, footer dark mode
2026-03-13  ba263676a0c02133e8de30db02bc0fd25585e5a2  794b1c97f456610caa50d7c233c3e5a8846264fd  Bump vite from 7.3.1 to 8.0.0 in /web
2026-03-13  e2b8b66fd39f30c240853cc82dff8f29f33a83bf  64f774358ed93c1a100da1a9cd8d0702db83ed29  Protect HomeKit pairing keys and add timeline episodes
2026-03-13  ebc618cbfe7679a61349b02344fa73da76c5cd48  b3b3e6a3d7bd9a2c9f8efc3ad52f4df87dde3531  Add Docsify documentation site at /guide/
2026-03-14  05e988bf03be008a660def09fc9a0f3706aea897  4f89c0113ed1601ad1e67b8e07cef3eb0c9cee6a  Collapse bridge devices in accessories, fix quiet hours, dark mode polish
2026-03-14  1760a60852f9fff4493b064d3c94e348a8dd08e0  eb312a0e1e5a89af056877db82346af36d117e82  Add archive before delete setting, implement device notes backend
2026-03-14  9ce95aed2f83a39a3a1c51205ee528474dc7368a  7c18fc1e51632515c9f2c66d938e0a86f3dec934  Style PIN help and Matter help modals for dark mode
2026-03-14  acfe7c1f6e82a0a883185b1d1ec2033e978f011e  1d71ae41b2744c9888033b66a72665eb90f6a929  Make env var tables more compact in docs site
2026-03-14  b67b93fd06209bd16e32754cce5c155b94af2b61  863a10e319c88a9d2c45c1630fc8f88fafe5025b  Make all checkboxes follow the selected theme accent color
2026-03-14  ca4e3f0f250a6cd7ffd1acd8ae3273d2eb8c1855  5aecb8f58145bec6c1cd9735c50331c0135d4b4d  Show clean version tag in footer, remove Build prefix and commit hash
2026-03-14  e5fc5a6014624cbcf331f1237362edecf8403fff  c50a21829ec3d2d46ff5e91cf6c7aed2d2a5ed51  Dark mode audit fixes, document appearance/retention/quiet hours/device notes
2026-03-14  ecbac9625ab662d213976a96d9eb06f65ee242c7  06e0f101509c3253c4530047a76284700756236f  Fix oversized search dropdown items in docs site
2026-03-14  f579a0e3e0f3cdd75a5c7ceed7b34faa12457bfd  36b8bdf5bfcc3704073661358ce351defce53e72  Add hc-modal-close class for dark mode close button visibility
2026-03-15  056134b7958eb82bf5357359f1fc05ff345d415c  5d931e88d156c0b867f3178681f8cbada1ada32d  Pin Trivy binary to v0.64.1 to fix install failure
2026-03-15  091481abf0173dfe64a2dfc993d680b92759d92b  189ba82b9af1a212262c9b7c0b33c688d3d4ea75  Merge pull request #1 from havuq/dependabot/github_actions/actions/checkout-6
2026-03-15  092114dec8a829475c492fb6a91808cd30fffcbe  1f241f43f00306166faa24c92f8beb2e6d2fad6d  Add Trivy container scanning, fix 3 critical CVEs
2026-03-15  0ab2aaf79595ebd45a40d157b7b5359923056160  2b7f9cf9fe20d7724c0a5bffd8221a2b88b56399  Fix Trivy scan: use docker build for local image, skip upload if no SARIF
2026-03-15  0c0361b7aae707ac0bef75c2d2c52bf9403f8103  eda3f2a3099a7ffd5da3578cb79842c6a1e712ad  Merge pull request #2 from havuq/dependabot/npm_and_yarn/web/date-fns-4.1.0
2026-03-15  0d7667ca4ee3f312cde89a7c3edecaf539fb2d3c  65f527b4d55893229492be17dd01b92bc74db2a0  Fix Matter router tests to match decimal node ID normalization
2026-03-15  0f3b15440022a58600bf5f18103ff30acd717986  9b9c0d5b19c57373c0fada99e795d6ccc3467b73  Add episode interval setting, fix bridge room warning and child alignment
2026-03-15  1780cd3f6936bb6aeafd5b6e62215e4b17012eb7  34affcbf232735839ee5fddd5dce2fc96502a97a  Theme episode cards with accent color instead of hardcoded amber
2026-03-15  28810060f6faab83af8436bb0dd875a740ff8290  2bb5be1deb333814170ddeabf60da91213a1e109  Fix dark mode: bridge header background and divider/episode colors
2026-03-15  346c38d686da512a5819235b0f1c1dc1b9901a2a  740cd3e4bb48b9f76c5b11fd921aa5b6316608ce  Replace trivy-action with direct CLI install to fix install failures
2026-03-15  495dcb33b684f0703fab560e7551a775a0a0a63d  8d30c1f82eb6b9fef543550ee986263805166d81  Add scene/episode tuning settings and accent-themed heatmap
2026-03-15  5ca5b47fbfb0ebd64aab8928e4532b57d685bb7d  1cfb400c71e029193b1c818ec558a44bbd6377bd  Use direct tarball download for Trivy install instead of install script
2026-03-15  61f2a63066857d95c5b079f9ec29733b9ca4b7c2  74cabeff32b80c65c747db6338b8657d398572b0  Bump aquasecurity/trivy-action in /.github/workflows (#44)
2026-03-15  630f31212989c7c3cc21575031db7583e8a857cf  a723584eee05f75d4c05163c5c4093dbe8641666  Update Matter support label from alpha to beta
2026-03-15  7026a6b0014422e13b505893d980f7a8b93a91cb  978981d3f84c542488f1340f9be88c64b5a6fa97  Fix Trivy version: use v0.69.3 (v0.64.1 does not exist)
2026-03-15  822a6481551e21afd060bd3930a2cce88a363088  15f34ca125b065ee4e1e532c8d626401bcea6e87  Add v0.1.3 and v0.1.4-beta entries to in-app changelog
2026-03-15  89fe52cfdc85398acbf65b3645a25192e3fe2dde  82bdb2afd296cb3f351a4552b6e3d6d7cee7d3a0  Upgrade @vitejs/plugin-react to v6 for Vite 8, fix App smoke tests
2026-03-15  9038d10a62343671365619d07b309613e258fc96  13cacef7c54e9d846c151efd32add299f3859d6d  Fix cache-maintenance action failing on undefined cache entries
2026-03-15  b9e048837935896e1b61b987a1c559daa5af67b7  19d31af04483288de39fdcdf5c94708a0ee6b41f  Make Trivy scan non-blocking, add table output for visibility
2026-03-15  c8924645dcfdd35692b6f3de08a33441ba73230b  9652cf084051d7917a7dadc9414f8df4317c9381  Merge pull request #3 from havuq/dependabot/npm_and_yarn/listener/express-5.2.1
2026-03-16  475acffa5ebdbaf62cd710fe5cba250476174749  ac6c256d03683352fc727caef1de523a27e6aecd  Bump express from 4.22.1 to 5.2.1 in /listener
2026-03-16  53e0cc5987eac34a31efd5051021b84a33e93f33  b58b8073d5ddf86a46a13316519cc34dab47c5c4  Merge pull request #4 from havuq/dependabot/github_actions/actions/setup-node-6
2026-03-16  57b2af871e100bc85e57a34aa1f9f7b6f6652098  e121e6244d4b4db39247605d312d3761993ea244  Bump actions/setup-node from 4 to 6
2026-03-16  58af501add20a3f483ffde9b714fd9a825917ca9  76cc9f9e6ded1a5c8d819eef809c11e294fce162  Bump actions/checkout from 4 to 6
2026-03-16  68980d5ded02ff7c354392e224c2b3e85c0e839d  9614186c42bf8c8ebf8b696ea7fb2a83b4164295  Merge pull request #5 from havuq/dependabot/npm_and_yarn/web/jsdom-29.0.0
2026-03-16  8a06fd25aebc278bd47dd85191beda00142b00ae  cb6ce125f577c231d2e3783c6c06e9f67692e580  Bump jsdom from 26.1.0 to 29.0.0 in /web
2026-03-16  cf29b643a57762d35c9b593dc2ab79ea2c521367  e737cd508b7dac415c998ef03e59558a801b4094  Bump date-fns from 3.6.0 to 4.1.0 in /web
2026-03-16  d68cc4c87c34010dbfcfbf7191ccd0760d0bc8ee  9f2888745d227c00238d630dacb09abd058d5abd  New themes, accessories terminology, settings sections & UX polish
2026-03-16  d6f1dd7cec601ffacb3b478ca2c0e4aad6546926  0e799c37e9e1fe3865aec15cdb4238f087cf6270  Differentiate Teal theme from Ocean and use accent colors in TopDevices
2026-03-16  e9278612477442891d4a62cafe583451e63086df  a43327e965ec40f5c90995009699f359d48c2ce3  Add roadmap with potential feature ideas
2026-03-17  07b80f50657e851a486d5d629bed0487a98fa425  4a0c36410184fd42f86db5049f92d1035ba01789  Add protocol badges, improve room color hashing, update changelog
2026-03-17  13cad9eb951779259d5fbb3a211808c1bc78da6f  710eab20c6c61cbbde0fd29a1dde91560f67a742  Fix standalone build: add PGDG repo for PostgreSQL 16, replace su-exec with gosu
2026-03-17  2fc0cdfe8c46617e195f06117f9c1f9a780ffcc1  c94782d01e2a601370d4116ee6c7f0d3441ec5d5  Add standalone Docker image and update quickstart messaging
2026-03-17  46894bd2525985bd3c2e7e96447bf20756e1c066  efc6bd0cde14284601412f9abff7ecb22bc64513  Fix MIT references to AGPL-3.0 in README and docs site
2026-03-17  57fc6fe17540e721204c39a5062b9d9d04920c79  7f2799b2d6463ddf7292edf696c1d9592273a028  Add rolling beta tag to container images
2026-03-17  6c105c0161ceca9c75871aaaf3f028999830f352  f1ae6c0c845b1055f7d26ea31050a83f364d8315  Fix Dockerfile: use built-in node user instead of creating uid 1000
2026-03-17  7e8ea73a2415529bf937a717d6969f7eed6b009e  ba897fc1629b6eeabee553d3978c3b3ed438b70a  Change license from MIT to AGPL-3.0
2026-03-17  a88797225065b8fe18febac49eb2db5cc113d2d9  2c0b1f672162b735ffad1f833a1c5a9ca49a2502  Auto-generate API token on first standalone run
2026-03-17  abc01ba730e0a7892cdeb06a508e74c0e4ade486  c35e5354b897bcc416720c59a8d8af82a6a5cbb0  Performance, security hardening & accessibility improvements
2026-03-17  bd38c8d1ec185c198f654ec90a42ababcd405908  8b088f795ca23666f6ecea5471322f82836e88a4  Dashboard polish, quiet hours API, dark mode tooltip fixes
2026-03-17  d3ee94a5a77c4f55ef0bacc94f0ef6f7a61145ed  187e49aaddbb9c07630a31ec5747de13dd85f866  Fix slate/alabaster themes: add to VALID_SKINS and improve contrast
2026-03-17  e94b7e12f07cfef6953ed683c49957b2fca7df62  4dc2cd06b0bdb9d8d9cc05d8f89bead47cf6d934  Reorganize docs and lowercase branding across all files
2026-03-18  0a3c4da7a2c0fa29c15220f53802595539669fff  3d67d022afefdfde524b9ad3d7938e24e899d95e  Add rolling beta tag for prerelease Docker images
2026-03-18  46ff9e8bc935bf9168ca10787f5bc6dcbaf10d4f  6c753bec529e8842ec7c214352116a407d2919ac  Add quiet-time muting to roadmap and update lockfile
2026-03-18  4f8d9238489f7a77808a706e20635ea2895d53b8  e316f395d1af7f6cf45b8d5095703b2fcdc85eca  Poll initial characteristic values on connect so all accessories appear immediately
2026-03-18  6fae9d9a2c23abb6ebb8eac11bb3c2b2cd9c30b3  d602424a074c3b0d18279ac7e298e02c017c5143  Fix theme selector and heatmap accessory filter
2026-03-18  7ce776eea62305f0567096c99af7405af2332003  76bb7259acf76e4cc62415694061a477263b5afe  Add changelog entry for v0.1.4-beta.10
2026-03-18  a0a3868ef28881d74896dcc1b2b99b439db2d013  2f92fb67b03028e63bd459265be140269b8da120  Fix theme swatch colors and skin validation
2026-03-18  b83349265a494024262428368c2d543cb5531f1d  0fd83d488a4929952e2ba69147403d367bafae69  Fix initial poll flooding timeline + restore slate/alabaster themes
2026-03-18  c1c07438db045f685e4da815e661a04748118808  a99ac09f3d351593ad6422ced98c0cd01cc967ac  Add real health checks to /api/health and Dockerfile
2026-03-18  d6ace0cbff4c81754670571b509410ca60743ab3  2be190c8a8d113a9c991adb0d7e92e6042b11873  Fix timeline jump crash and cap heatmap row count
2026-03-18  e44d49446ca8efce931fb1fb20eadd691993aa7f  983d9da448f4a233204742796a851f482bd2bc0a  Update theme styles and room color palette
2026-03-18  e4bd4cd19bf8e05966ec87a1f2abf15df7281547  a8f194a88b35cc7709c0ee95d1caa4904469aca0  Add dark mode support for chart axes, titles, and tooltips
2026-03-18  ea84186f32fd2af33e7d1b59e9081f5436124020  7d1165b94388e89347403a3807afdfc8c468faeb  Dashboard dark mode fixes for anomaly panel, quiet hours, and tooltips
2026-03-19  15b8b8228fc893fbe23fe08fd8c7a13de14ca363  23f76296527521e065f798891ee4ba096731c0e1  Release v0.1.4-beta.14
2026-03-19  30bde063b8c095471bb6d6c72594cd8b9d9265e0  c9ebfd3fb100973e3a4ca360b61b6d623b5d80ac  Show bridge names instead of MAC addresses and include all discovered accessories
2026-03-19  dacb23704de7e0f604656076853b3407c8e150f8  d6db82cafc1b8154935c79f21708f938a9fec547  Merge branch 'test/fix-initial-poll' into main
2026-03-19  dc9c9f9ab3b9f102d69270ea565bc849bdbf3402  f193c2142c3d69165a158752e400f769da0486db  Replace hardcoded dark mode colors with CSS variables
2026-03-20  0e14bc48e7b0e06fe0d8d97229ff1201ccd9e235  05c85827350230779169b5df8788e5b4b7569bc2  Release v0.1.5-beta.1
2026-03-20  1b659ba19d6bff0f70e3d36ac0f2e930b2cbc10b  150658d14607ce5dc74c9b4a373b43663f2c5263  Release v0.1.4
2026-03-20  27a0f1a0c75c12e7090f761caab09af479a8de0b  67f0faee3af9e22754b0963032f603408507fd7b  Switch test stack to named Docker networks
2026-03-20  3e03f667e8a445bade2615202fa8c83298d09bd2  be190d71e854b970c581359caf24a6c2883652af  Pass API_TOKEN to web container for nginx proxy auth
2026-03-20  7b3e96e25907e723f12675eccbdafa9971062f6a  2404d30a5059d1adca2740672710875c48faa91b  Release v0.1.4-beta.15
2026-03-20  986673d49746bd11a1ea6ac17d93d651a6f49041  23e35c1648a3088b86890329118c01e992afba43  Track docker-compose.test.yml for Dockhand git stack deployment
2026-03-20  b5d7eb4d2be227ecec4099e6f848d8abd7b5722a  af0d0a6c317a9b0ebf660382e56961bd404c214d  Release v0.1.4-beta.16
2026-03-20  bb1e965641a89d2e395a69e59cefe97a6c5862be  d4f51931f6297421ed023a3773078bd7f7d16e9e  Set default API_TOKEN for test compose stack
2026-03-20  e76a132796b87f9213d74623d33ebad68f4903b1  b1da7774d2072b1e318e51995408f76fc332a81b  Matter controller/runtime improvements, quiet hours exclusions, container cleanup workflow
2026-03-22  036231e4fa174d3cd696f56832798420fbd37d45  40b72971455eb65c373fdcd568555a751b4b1fee  Update all GitHub links and branding to GitLab
2026-03-22  340bf1fbd3407c54d2441dd8574ed82a4048a514  bd89926185b12fd8d2dd2fdcaffb71af907d47c6  Update docs color theme to match app branding and fix GitLab icon sizing
2026-03-22  56c0c6b2ec7faabe92bbd573b6c543a7619819f2  9beb565e5a3664ed6206c6da98816b97e346cfc8  Initial commit
2026-03-22  6fd5c62ea44ce386d2c8f4543b3debc93367f06a  6fe7bd2945510906682812e31971d1b50b1bc249  Add manual pipeline trigger for building any tag on demand
2026-03-22  891586a12f96f6c254c868a00cef8fa47a1f81dc  c959c68c4b76dd2170d02f1efac060f3ef874ebf  Increase GitLab icon size on docs pages
2026-03-22  902a29c921f902b7b2228442dfebb1cb0462f838  c893277efaaab8f6e481dc66b1bac5135e9b5d9c  Add Docker pulls badge to README
2026-03-23  318aec2184401953a48553318a8302c4e10f7930  d6a27403f56b1e6984e99a87be41c41e1a447ac4  Edit README.md
2026-03-23  65fd2b775640e6ccecaf3131a4f0792871642ff2  fd15317c42fd52c35f0f88bf3a133d3920a1bfc0  Update all GitLab references to havuq namespace
2026-03-23  b630c8279f83746eab0bbe56a9e9f0c0be1f67c4  168acd25da166c09a7545b3054394c73c3d17b5a  Change GitLab button hover color to match GitLab orange icon
2026-03-24  09b0882e0e33a294131e282c78cef6e22918cb64  30ee6923445331e4b73089e5380b1e085f1d44a1  chore(beta): add dedicated .env.beta without legacy volume refs
2026-03-24  182eb714aec5e703c8a41088789980f7bb465c01  1287abb839e67d04cf9d507b1d258396d9a1ccd7  fix: apply toast display settings immediately on save
2026-03-24  3354dda7f61a452f7f8687e2e03223870953166e  573d9297bc65824ecf2b6f0cc834f5062c7809a6  feat: configurable toast position, duration, and max visible
2026-03-24  3d327694ffa0ff344e3ba0703e9f6a8d60a319a2  aee888aa731086a72fda0755bc74d9d1d39b5eae  feat: add per-accessory bell toggle for live event toasts
2026-03-24  421b07027085928b5e6bfa0e039f686494252615  c3b7a1076c00f897da7a629bca5693d7137747f0  test(subscriber): add integration tests for auth failure and auto re-pair flows
2026-03-24  4653afaf96f15a9a3312888e199863e088f03e2d  80078a7ea2a53f38bd7257bc23e18d9eeaaf6150  fix(subscriber): expose auth stats in API, schedule re-pair retries, normalize getPairing callback
2026-03-24  4691ac8528c28a7134132e35654d6887a444aa6c  9b3a711c793190dc809de7f778b5baa3849e8769  feat: add max-visible cap and info icon to toasts
2026-03-24  4a71b08976c18c61fa076cdeb6c2667b2232b854  43891c56a5e3596023f4a7d25df4543524baace7  feat(subscriber): include needsRepair count in health endpoint
2026-03-24  4ce6fad6645a452a3046a54c9c2fa7cc64eb22aa  492fd4a7ff4a9f142cfa4abdf343ca3079152db8  feat: add Notifications section to Settings tab
2026-03-24  569158e0b2e79e321b68e21d44f25a299b96ae92  25aacb154f3781dd019db236e6eb0ca06ede4386  feat(pairing): store PIN in CLI pairing record for auto re-pair
2026-03-24  5f21cae9471a5b0ef5b9f04671d8ae935e67c690  a832905967d5a0afb1f7a7707f4ea3ba18ddbb45  feat: add toast display settings to retention config
2026-03-24  60382efaad453a2fbc5c741ef26d7120a1144acc  4296ed7fed3cc78455e0ee0262097058865c41c6  feat(api): add toast notification fields to retention config
2026-03-24  6b23588ced0f9538d3bedf043a109ae46c8fe7fe  7b9ac62903a8ac57fab48b00a18b7e8e6e2cdafb  fix: set postgres container to run as UID 1000 in beta compose
2026-03-24  777d20799d2d53697b6349fd4180b7e01fcd8023  b15d8e3471d074dbc755f4fdcef4821b5e7e4aa8  feat: mount live event toasts hook in App
2026-03-24  7e0271e845b1cd294a60f5e2389beb0c67888b2c  0e2459a1fb363fedc9964f4f5ebb695ff767c876  fix(dashboard): show empty state when no data exists
2026-03-24  82aad5694cc62fd883e3848235396845c2367de1  f352c8feece29d274eab814123f64a82bf7bffc6  chore(beta): use host path volumes at /mnt/Primary/apps/hc-beta
2026-03-24  8b117f78be3361da5e575a7a02175739454518e2  05e2ed7c6b1cc4c6db42857fc7ff943ca3b95f4e  feat: wire action toasts into save and delete flows
2026-03-24  9307eee781752903680630f44c642ca95810fb2a  c1f0c141d99f446d4be2f596bb89ab6ec03bdf64  feat: wire toast display settings in App
2026-03-24  93ac78ec3223a962c5f7d9084f2c9dc3578bd14f  c6aface6ee8703a6c1475c58cbc74ec1cf8ad7e4  fix(docker): replace recursive chown with --chown on COPY to fix build timeout
2026-03-24  97fb6e95438f21f1ba515f5f175a74a85b34c14c  8ed3d830fb75e9d2881798b62e4555a1ad9ac3dd  style: restyle Notifications section to match card-based settings layout
2026-03-24  9ad3c3b317fa2902ff950a7a9c294a339f866a0e  1434c5749f4215c157ef22dfc2e01fb376ac4f3f  Release v0.1.5-beta.2
2026-03-24  a2939b099a16147f203cab865db0de8d41a39810  926a5805643a44afe21d02972e3f0a6515bc9314  feat: add useLiveEventToasts polling hook
2026-03-24  a54f1e88c6cc3fe864b9f1506c76088fda4bad1f  d283415180b1371ad96923cd008314857ca5babc  feat(index): wire discovery and save callbacks for auto re-pair, store PIN on pair
2026-03-24  aa2fb13ece8663ee20e3c194e2f7569f68e06dbb  8f172b14ea3555ec7616216b13d3656a8610d509  Add auth failure tracking, new stats fields, and concurrency guard to subscriber
2026-03-24  bb710a7b4d1101be39206005b10b1fd4ba6a4bc2  35e03a52905f1a99345e440ab8c0e541ef1ef7c2  fix: wrap App smoke test in ToastProvider
2026-03-24  cd2823656f0d5cf5da5c70063da2ba6d83bae3e3  a2e2bde5634d524b3e0b9650c8e4d184c07aa251  feat(subscriber): implement auto re-pair with stored PIN and circuit breaker
2026-03-24  cd42507299fa9eebeab4c0c74557fc005670d8cb  882ef2c5d453af35aff5b3dc7e906c8f48474283  chore(beta): use named Docker volumes instead of bind mounts
2026-03-24  ec2a476a2fa1eaba16e0d1f748d94392e23d05c2  abcfc113797fb7c152b670c52e9af37af72131c0  feat(subscriber): add auth and max-peers error classification helpers
2026-03-24  f1fb0f6d4c18bd5ed2acee8f643b815c6ae42d1d  bfcbecaa3978902647e7e89108d4fb9af2e2eb3d  feat: add toast position, duration, max visible dropdowns to Settings
2026-03-24  fd2c3d580c87b039ad4b4859a859e80c57b49049  e6e7f6a55ff42a48124beb0db64807332da8eefa  revert: remove postgres user override in beta compose
2026-03-24  fd92f7735bdbc8b1276c5be93ed57d8cce82692b  1b0295488039388df18d36a5194b6925c7fce0fc  docs: add M4 auth failure troubleshooting, auto re-pair design spec, roadmap update
2026-03-25  0377a918e9f57b2ee4875661e0c85c286d509c0c  eecfbcdd3b4bfaae1a4bdfb2e061e36aa5cbb5aa  fix: reset autoRepairAttempts on successful auto-repair
2026-03-25  474365068bdb0bb3ce5ad35c716a90fc2581be5d  2d3f8210f7655a427d53a90c3de4cead667f8df2  feat: add RepairFlow modal component for guided pairing repair
2026-03-25  53599f829f13eb4280b9270eab49c7dbf37942e5  bfd9c9acd296f0371d0f2396aa294041142c6ca7  feat: add isConnectionError helper for port re-discovery
2026-03-25  7eabe9929b9e44d468d74cd3a5d8aebaf75a8ddf  79bf5a0e09eb33d6d6e4b8c32c97567cdd0f5986  fix: allow trigger pipeline source in GitLab CI build rules
2026-03-25  86f5b087bb991665d928708b5f21850583e9be92  77b3fe55c6e9cc28a59747a669ca1f4d8817e734  feat: log warning on startup for pairings missing PIN
2026-03-25  ad840eb250e63ebed0ddfee8775618f8822a83f4  a6dad8fc8c5092b1c7197a86d0fc6b5aeb179a09  feat: add per-device repair button and health banner to My Devices
2026-03-25  af87cfe6f3221d29106fe959986389fae01b71be  d90363c9594e21cee731982cae2bd77047292768  fix: disable DinD TLS for buildx docker-container driver compatibility
2026-03-25  b9b63604e2fa720e916475f8676ab4952952d94c  580d6f444a14003a66e137b96eff59d22de0e769  feat: re-discover device on connection failure before reconnect
2026-03-25  bb7c6b2b48b890e2b06ffd31216b5d5f35728d94  06ad45d2a0e2334a0a74bac06c796e8e55492f0a  fix: add multi-platform Docker builds (amd64 + arm64)
2026-03-25  bec658ac16bd9653b192701a54a01ecd7481df39  e6dc9e611c37db0af86cc78161150dd1bcc7597a  feat: add pairing health warning banner on Dashboard
2026-03-25  d58e7d663960164c2cc961b8eaf52d6da114bbbe  4d533cfb1d1519ec746de5f83b420765deb87c25  fix: use docker context for buildx in GitLab DinD environment
2026-03-25  ec5ba24e169f37e9394038913b1c0f6d731f1bbd  77a4ac6ff36719d99e5dfc5f5f36f4910b50d635  feat: add repairPairingMutation to useSetup hook
2026-03-25  fec973fd9921d24dc6b570d27dd0160308bb4012  73331d7214b65459477a2ce75e9103a5f3978779  feat: add POST /api/setup/repair/:deviceId endpoint
2026-03-26  ea1bd1f6c4c3c803fcd9fe4a2aed5019ee09e41c  eb2ad0a02ab5724caf52fbf636cfb8cca46a1602  docs: add-pairing CLI script design spec
2026-03-27  0209915525f15f7df0e90b2d9cd41b72205c4af2  06a2b6b5d9bf2a750ddff62a2dddde96a793a251  feat: add Live Toasts toggle to My Accessories toolbar
2026-03-27  02b620db0bf078c7cf9cb635cdb36929598040dd  7365c58dd19d655de3600ce4f4d074f4787cce8a  feat: add-pairing UI panel in Add Devices tab
2026-03-27  0852ce57c34ed0ad489b0939bc498f34c4413cd6  44f0580887661d536b142f5034a893c8433b4fc7  feat: add POST /api/setup/add-pairing endpoint
2026-03-27  0e66ff13eeb3a8dbfa5bb66f928d340391e573d0  1572663d247ce98189148f6320d70252ad225e0e  refactor: extract runAddPairing() from CLI into reusable helper
2026-03-27  37a9b47524928a0ca75991c674c68b88fe8d77a9  a077c36be3b3cbcd59e4fcfeffe9895fc1d4177a  docs: add-pairing UI and documentation design spec
2026-03-27  3b95cda4b67fd3181e0a58875bb3b58466097a21  e4cdcb2f8d8201ac584330afffb56e1049138491  fix: pass VITE_BUILD_VERSION build arg in beta compose
2026-03-27  49a4891ac13cf496767f5b8f9d2d141b84488235  4f9b62485e6033170e7eb6670bb66a5dae12a131  feat: add Repair All button to My Accessories toolbar
2026-03-27  642f20bc120a73bab287b6cce68ab9cb90c83913  f088a8a1757a50e07a40fe36289bf97a36916c44  feat: add npm run add-pairing script alias
2026-03-27  81a9cdeda75d7042dd8ed6058992e0daa4b5d5eb  892e8a0926005fe5a430197d3fb018b8db427834  docs: add Homebridge insecure mode requirement and CHANGELOG
2026-03-27  877f32147ab2748de21c0a3a3e686c1dcffd8b70  5e7b82bf77d245587517ae6e6218de33e0585a7e  docs: rewrite pairing section with multi-controller guidance
2026-03-27  8ab3ed4c84d5bec17c45fd8a2080c0418fee1043  b036f78316d25122db68daabc93fde5f9cb46474  fix: soften pairedElsewhere guard to warning instead of hard block
2026-03-27  99890bf5a888422f29509ac81b404b607f0ad2ac  c56540b73deea4fe31d1fc718027cca951e68538  feat: add identity resolution from existing target pairings
2026-03-27  9b417230f7f3a851685a47ee9c87878210c1e845  f753b4d86bf5e09fc050f465ef1a488681fd468f  fix: detect devices paired elsewhere (sf=0) and warn before pair-setup
2026-03-27  a12cf0589846a8362467e1b78cea4379021e272e  e6c04473f1f73846afd7146619b7b06f1bd100da  fix: use undefined for optional iface, anchor HAP error code regexes
2026-03-27  a4dafb939247136cc51ad0436feeb82fc4468092  e2edaf757cbc3eecbdc804374a15bafb2b3e642c  feat: add-pairing CLI with discovery and addPairing orchestration
2026-03-27  a5879752a18e570dc2db83a927304fcdc5ee5994  e51db1052d9460b9cc95ca4e4f0ae7645863a328  docs: add-pairing implementation plan with review fixes
2026-03-27  a68df537e81843112ba2e34da5c347116e9391f8  76a058ad72a70fe4cbc5c4c5c30f19c23fa18c72  feat: add Remove All Pairings with double confirmation to My Accessories
2026-03-27  b3b6194418df4ad074394e98f31ef73088e5be34  a02e759b64193ab06add673ebcce778a7c2972e1  feat: add addPairingMutation to useSetup hook
2026-03-27  db89238d2bf37430b56ab4477dd0d2c635d9d8ed  046c61e36a2c3ab0f5e3e56ab32767684f0c4203  feat: add target pairing record builder
2026-03-27  f157a112c7907f4fbdbbed48dc1a95c67e27e2a6  077b32ccff31a53833618d2ebcbcc7e7c1059801  fix: mount prod data in beta compose and fix Matter toast matching
2026-03-27  f6f329d5b17202fa92c153a0988eb24e50b17f02  a2f87c864f2ef988caeea220a3c9fbaf810406b1  feat: add Ed25519 key generation helper for addPairing
2026-03-27  fddbb89286e3591be34a04bb70ba2999a88c9ee6  b88d63f37a9b744fdc43c8c5ce312f8fb57ec1c0  docs: add M2 Error 6 troubleshooting for paired-elsewhere devices
2026-03-28  09d8fea378dd48950d7a630bb5d04c378e2dce37  cd5325cdade13792e40a2af3a9bd34fce7cd8164  docs: update hybrid auto-save spec with edge cases from review
2026-03-28  83efdd6a272c9d27068a8b1abd182a907a54a875  f0970e39248f1a58aac69c00ef61feb502df8ff2  fix: improve light/dark mode consistency across Settings, My Accessories, and FilterBar
2026-03-28  94bf4b246306c275a698978ea6adcbc3ccd25704  30cd843b03c279ac686f359d12397ea7bef6821d  docs: add hybrid auto-save settings design spec
2026-03-28  af3287b14caf6cb606ce685a516ff6032d8c86d0  132dcb5a086150d00a776e2a7c34d61675348b5f  fix: use skin accent color for success and info toasts instead of hardcoded green
2026-03-28  d57e0a260b5656fec97224b3fecbe97940b4f889  699d27abd7ef3f921461f31316eb474995ab8c9c  fix: match child accessory IDs to bridge IDs for live event toasts
2026-03-28  dab4c1bfb5cac40230910f7b4e80a3d1d9867d23  6e841c68b355b68f2cf4dce03e8b6b8d080987ad  fix: security hardening and code quality improvements
2026-03-28  e0e7a7c645259ad8a387b076530c3e459f39f7d2  3b427ade3dc4a376acf755ba1437e0ac93a21ccb  feat: redesign toasts as centered pill banners using skin accent colors
2026-03-28  f1dd57016445dd18c8c6abb3b046b66d46644770  cca52e0855de7b3d5a3edd7b9e114d0ecdc87cee  fix: darken room label colors in dark mode using light-dark()
2026-03-29  3ced03fe39c09105ae29ce2dad3308356f463ab1  991f102e39d4d41068eb1a2f3f82f9d8b75f357a  fix: light mode readability, skin-aware charts, toast position, and UI polish
2026-03-29  b551654b4d96370a9d3aac3f81084a9ed3666d90  c23a64e55a59275a81bcaa58a9c646f0632182d7  fix: API hardening and comprehensive dark mode / theme audit fixes
2026-03-31  072be256073aea33428c22c50af2d0a02dbc5b2c  c1aaceeaff466c31d638ac5583298a007902c3e0  docs: consolidate changelog for v0.1.5 stable release
2026-03-31  2ae01e0a9fadd819f5e6a775545d54b0568c7057  9ad6eb4244b09775ee8bcefcfabe753ad280ed56  chore: remove test-results from tracking and add to gitignore
2026-03-31  2bb4b6e1a424625815f59a3f96db1e2fecf3d192  4e6e78ba47c3e535cc5c74bbfe6eb8279737c2b1  chore: add gitlab runner compose to gitignore and sync working tree
2026-03-31  63c2e9972076cff4f76f7a180a2ce3b02de7add3  5a50a068c5a30595b2b94ca74778fff94a6b945b  fix(ci): enable TLS for Docker-in-Docker build service
2026-04-01  3cafdfd2765fb5f9faa006f8bab5d9f80bf69721  a52ed6c6bd5dcfc711819de68d43dfb448a10ddd  fix(listener): add 2-min grace period to health endpoint for HAP reconnects
2026-04-01  4c96140162f30adea685a617a7dace2e6dfb8922  b4bc5b9f5c4665a0587489e884f240c02e900d61  fix(ci): share buildx cache for scan build and extend standalone timeout
2026-04-02  04931fcd4bfde622c5c6ba06eecc8a9dcb48443c  4dc3b324085f203432b9af9db664b5dee8d29542  fix(01-02): convert 6 silent catches in matter-controller.js, store.js, pairing.js
2026-04-02  0669d5cca172ac3d0b164ee12529aa7a868328ad  4315868337a665b03f86271672d3e9e8a603a0da  feat(06-03): rewire index.js to use new helper modules, slim router dep bags
2026-04-02  12d2db17247a77591bec764a6260e6a4fcc688e8  ea8cd9c52d4008e3472462d001a96f40e033dca7  docs: add v0.1.6-beta.1 changelog for Code Health milestone
2026-04-02  1620ac8efda53522a749803effb46339c820ce7b  dd16df60b342b5c17b96aff534befbf4733bb980  test(04-01): add archive-router integration tests
2026-04-02  16f2144b79f5038d8915babcd78123e5d54770ec  0e7c7601a8e43b0385751d2b6fb9cd9446c2dce9  test(05-01): add integration tests for accessories-router
2026-04-02  18c2862dd792c5e188e5b64ee2ca60325f359966  66281bafbaa6ff9357dad1f90a6de5f65350ad97  docs(04-02): complete stats-router and health-router extraction plan
2026-04-02  1f2390ee1487f999c380671aba03bc5babdbf721  7e64fa40612abafebf7ddf27f3862aa845b66bde  feat(02-01): install node-pg-migrate and create SQL migration files
2026-04-02  29c7730afd5265741161fa1f5827707342cb2760  6d77833a51d92ae128c4b37eef52c9e0d2247948  feat(06-03): create setup-helpers.js and discovery-helpers.js, expand utils.js
2026-04-02  2b90108d4510745513af0e7ee671b25a6272b0ea  d6bd693101916937b42fbf90493ea8c7c9b5089f  test(01-01): add error-handler tests and install supertest
2026-04-02  34efc897ae8ec36bd7806e3d971b57ec674856ac  f83dbf7aeee803f6c5f44250612709030ab07243  feat(04-01): extract archive/data routes to archive-router.js
2026-04-02  3c993b2d6db3043feda118ca81e4cd171914b85a  2bbd74fdcffef5af0818c72a0a37dfe55386ec5e  feat(06-01): create setup-router.js factory with all 18 route handlers
2026-04-02  4089f57f0e2bc4086822a32809438688dd451d59  0efb7f831c0a3fe653dc1f3c1b1cc984ac7cee7e  test(06-03): add failing tests for setup-helpers module
2026-04-02  40f20b3bf736e73df7fb942d7bdc02480a0974ab  009f12fafe5cec3fafe4c4a30ba40a923d98e77d  feat(04-02): extract stats routes into stats-router.js factory
2026-04-02  4acb3316e134a60ff2f4a26daa9aa7de1393513b  dff643f28279974c3981e9fd7c206471f9dea95b  docs(06-03): create gap closure plan to extract helpers from index.js
2026-04-02  4d393984513e3bb0364a4947fe0d42a564cf1242  af88ff7ff0c47623e070d0ada9150f6896218459  feat(04-02): extract health endpoint into health-router.js factory
2026-04-02  4d4d879a413c95ae21f30098d046c40aea20c047  d238b438474070809586da82f9c602f3db46511d  feat(03-01): replace COUNT(*) with reltuples for unfiltered /api/events pagination
2026-04-02  56ba513bc82cde5eb790806b5dd25e4da33bd1b3  69d803168976d933d5dac5cce78ff93560ccb2fc  docs: complete project research for code health milestone
2026-04-02  5d7fb67f91c7efc772968a22c2d433ee5d3cb0bd  7b7e91b572c32add43e08911855b2ff6bc756408  test(02-01): add failing tests for migrateDb() migration runner
2026-04-02  67b20ade9ee184d190ff9586a2fde933c24d45a4  ffa6b9ed6655ed5a53f1aff1c723ff53221a4cfb  docs(03-01): complete count-optimization plan
2026-04-02  6ea79f384838c029ae2f1972eefd774ce3ead8ad  48e91ef00d983b1b50b5a4d52460e2743cde6228  test(04-02): add integration tests for stats-router and health-router
2026-04-02  8be2b803ec1b675e12e53702634bd11414576260  bb6883e3fc23cba897c51964c0b6be976f8146e9  test(06-02): add integration tests for setup-router
2026-04-02  8e4e439525eb74bcc73e04705c26c9523467bbbb  25c87c14d6ce4bbf039c1a016bb7655bcca51443  docs(06-01): complete setup-router extraction plan
2026-04-02  98dd141cb5ff52686fc40f39ea34799f13264dc5  83f2e8888319c575d2e946c867555513490104f0  feat(05-01): extract accessories routes into accessories-router.js factory
2026-04-02  9a14220086baeea8c38d2d86fded86df5d4df53d  1975a9c8441c841aa4ede431e5c62c135f4d33f4  test(03-01): add failing tests for reltuples COUNT optimization
2026-04-02  9e994e89b88f1b383546a40ef711c29aece1cb9d  06a7d8b18389d5d273f357b7669938b95a1a7490  chore(02-02): retire db/init.sql from Docker configs and mark deprecated
2026-04-02  a22b32cc0655951ac14feec66f87cb1b8157f126  21e05a3deca9d368269479b90fa6ed0eb90c68d8  feat(04-01): create utils.js and update all import consumers
2026-04-02  aa58c7348bfd25272215db3f626bfa97f892177f  3b54444b24251cdbff53783a61ee9b75ddf5a445  docs(06-03): complete gap closure helper extraction plan
2026-04-02  afff28001f3835615177ab716ed210212ec2ae89  fe000e6a9b3f34968610d704c82af1e17493a03c  docs(06-02): complete setup-router integration tests plan
2026-04-02  b733362fb5037a9c6df53e0f62eff227558b5253  53cb7e4ad3bacda0a397556b4a0f2a4745acb445  fix(01-02): convert 5 silent catches in index.js to log.debug() calls
2026-04-02  b7fec6be007359c8ee76dcde6f48992b013e5cd2  2058acfde700f7ad8f60e2edee6417ca4084a359  feat(06-01): wire setup-router into index.js and remove extracted routes
2026-04-02  c91da48fcb55a9f28c76cca0dd86119d2b20bed2  9d752e0f52534a1c2df785529018cb5181fbfaa1  docs(04-01): complete utils-extraction and archive-router plan
2026-04-02  ccd4e84a64693ce78a33d5b92c9cbbd8d70c1543  a62ad4e5cef668c01f1f3878d3af6d50dd503f93  feat(02-02): add runAlertDeliveriesRetentionSweep() and wire into retention schedule
2026-04-02  da6736f31563a1afd29dca6c4200a34d7148f18b  6024cf1b1b20758d9ab29bc03af105a57f2e81a6  docs(05): create accessories-router extraction plan
2026-04-02  dba923d75f70f51375adb7972dbacef71476b5ee  15a15cffe078859b25fc7830e6141f125d50336e  docs(02-02): complete alert-deliveries-retention plan
2026-04-02  dd3746f0b60f69540cc0e93fdbc9267419937ad5  b5bdf512a10874d73d8143db0a7fd0013e448a8f  merge: resolve STATE.md conflict from worktree agent
2026-04-02  f308728f4ebd393122e01e3ca2ec15c56c668680  8012c8cb9c71ea99c0b48782da356cbb6109c34b  feat(02-01): rewrite migrateDb() to use node-pg-migrate runner
2026-04-02  f7afec687229f0927c6256b58f32b546c1da58c2  c44f8d31a2bf59ed34c94da427f05970aff1008b  Merge branch 'worktree-agent-a7060b71'
2026-04-02  ffc509ff167349258ec8ec53e01e62a97e116d81  0c4d5b9291c66f123cb10a7a314b472cae9931ad  feat(01-01): register process handlers and Express error middleware
2026-04-03  0ab30f0d7a1c16d7bad08d7b41e140c19da63b8a  6a6ced07db2584a53dda5e644a203678737fa569  feat(09-01): add Scheduled Repair section to SettingsTab
2026-04-03  1591084c0e8f401d4fa13411eb9908d9ab9fd74e  15701432db4b4a67925509f6c023171f139de75b  feat(quick-260403-2fx): detect and log firmware version changes in subscriber.js
2026-04-03  311fa65a85c925e832319c821283287a19be04ed  0359ca265cb32b86f2d2c9839c4a11e06ececde1  feat(08-01): add getRepairTargets() export to subscriber.js
2026-04-03  36bf098dbed11231dc497269f88a0b2c7c608330  092ea8bf53c32d44559ce40e33da05f732921c51  feat(08-02): add repair-router.js with GET/PATCH /repair endpoints and integration tests
2026-04-03  3bd96e8e6d6f17fde170193bc849b291a048bb8f  52d66e86517dd191965046a1bc5e1da246e07ff5  test(09-01): add failing tests for Scheduled Repair UI section
2026-04-03  586bf37875070e26475f32eb7827dd57440e3883  d2b8dcbffd86bc6961909061080fffbcc46f9995  docs: add v0.1.6-beta.2 changelog and update guide pages
2026-04-03  7a9a3ebc25fecda31da0c7852f6adcc75bdd9de0  df0753b2f354138e931344f7c16f70bb6dacb8bb  feat(07-01): remove dead code and dead exports from listener source
2026-04-03  97887673e872cc22d17994bef073fabbd05e4fcf  b461775d99cb7aad030f45b8a4c0aa716d7edd88  docs(08-02): complete repair-router and index-wiring plan
2026-04-03  97be7872181fed49729bb74d46ba62b233b34edc  1565112b670dfd6a541029e94eddd36eb1ccada1  Merge branch 'worktree-agent-a2672ccb'
2026-04-03  a9a4431164c2be76dbbe97c45b150c4a27b9fcb1  4733b183e82492ad838fcf8471eeefe7fc7a52a0  docs(08-01): complete repair-scheduler plan
2026-04-03  b6491dd8a3dd9d65307c97cc9af2f12bd564f8a0  00968f2c77da77c80e43ace16aade2ea1e43228b  docs(09-01): complete scheduled-repair-ui plan
2026-04-03  bd176bd8bf150242e5f849e3d6c2d67e6b656d03  f7dbd070aba31df26746918939b81070e9c30e7f  feat(quick-260403-2fx): surface firmware history in AccessoryDetail UI
2026-04-03  c25e6aa1806f34732998fba7a193af94f9fc74a2  fa9d3c12a16f1351ffc4b443764bbcf58dbea498  feat(08-01): implement repair-scheduler.js with full repair cycle
2026-04-03  d7d298abbed139ce1238d624558f1c9d2578fbbf  d584dffd74de25eb38cd9d398273420af5dcc6a0  feat(08-02): wire repairStore, repairScheduler, and repairRouter into index.js
2026-04-03  dae6a78a71e5434ccf82fec6dd3a297bdaf1feb8  5c09d598d9875be245338292d793fe9af7f3c939  docs(07-01): complete tech-debt-cleanup plan
2026-04-03  e53f75dfd8c9f3f32de74819120ee7acc849e98f  073b3bd95e8b2e372001b9ff7d86a3befcd99719  fix(07-01): fix test mock fidelity and update stale documentation
2026-04-03  f8cee2876d2548545e3181af8caa9f594f90ec5c  b16ed5e01c2c4730cdc4908cc738271630bd2d8f  docs: update STATE.md for phase 09 completion status
2026-04-03  fc019eaad2dc016d9e8233ed250e58d2f6b2ec87  246a82812e9fc8af961dc6f00d479b910c312c17  test(08-01): add failing tests for repair-scheduler
2026-04-05  7c1741d563a595230adb864cad9b43d9bc2d902c  7f31f2c96e933dc833f4ff604da5990facd2d9cb  chore: archive v1.0 and v1.1 phase directories to milestones
2026-04-06  0055c9bf2a2b92a213581fac52e8b85685081b0a  0527e042793133c3fb80363cf44eace523eb1812  fix(ui): match remove pairings button style to wipe all event data pattern
2026-04-06  017ab47bad8889a46294d5d35de77bbaaeedc3e3  1d85ea0b47a62ab1853c6849266b44e8f93fdc74  feat(beta): extract DB password to BETA_DB_PASSWORD env var
2026-04-06  102ce22ac0e604e2936fb7f19409b258ef83a964  9cd36850333b7faded550d5acb717e2a2853f012  fix(ui): use saturated pink accent colors in dark mode for solid logo appearance
2026-04-06  21573e720be14a024dd5f6758b9a9b7e23203828  ce4844f5c6622dd08f45c18c7d0dd3a54c272cca  feat(beta): add Traefik labels and extract FQDN to env var
2026-04-06  3e259d11a52986dc0c7cb65868279d6d67924111  6fad26da9e68b15b7522c03c8f64e2481d98a545  fix(beta): sync postgres password on every startup
2026-04-06  3e971ea797895f7c22c4800f04f0b64b27fbca50  a4efac0212b057dc608a44bc133b653226154845  fix(ui): replace native datalist with custom themed room autocomplete dropdown
2026-04-06  4577bedbeae979bfd0fc6809efb1b99ef4412511  8a22d0e8684294e87e72fd219aaa0181b3b3af80  fix(ui): match Matter device events for live toast notifications
2026-04-06  45922ef39b0fe6c162b981194959aea93aae59c0  f886dc923da424e1c24fc15ba31939773492b17b  docs: add Settings guide page covering all Manage > Settings sections
2026-04-06  5aeccead79758d41febcb0aa79c813dbc42c0418  28919fafcb3c7856cad7adb6655ab832a75c9648  feat(ui): add distinct card styling for episode and scene groups
2026-04-06  65012c97efc73656d2c5e0503f449a59a5bc8727  fb7ec62aae1d8dd8bc196be1e47561a9aebafdbd  fix(api): allow top-center and bottom-center toast positions
2026-04-06  7189fe3bb8c550f4049d2e877e89f4150fa0f19b  d5bcf05d97f31c966f3fbb6cbcfd0ca2f91f2ce7  fix(beta): connect to postgres db for password sync
2026-04-06  73fc18585eff129049bd83a7b425717cca4d9f8e  6a685c20c6169cd09542ee132d7af7b1d94056c7  feat(260406-lo7): reorganize Settings tab sections and rename headers
2026-04-06  7786a41ebf608198775d3d096c08f47ff6cac410  802c12cae5cd1684bb4594fb73af0a0187b842f1  feat(ui): replace Alabaster color scheme with Pink
2026-04-06  85a6f182d5fde20a55684e320378b08709111433  eb62cbab28007b9474da67b9ecb2007e5e6ccf53  fix(ui): brand logo navigates to dashboard instead of GitLab
2026-04-06  8d28cb2ed4fd6afce2127435620414bcfb46d901  33701dd946fa6910676e63dc15bb179f499d1a9b  fix(quick-260406-nm4): adjust toast offset to clear sticky header
2026-04-06  96f2ce676da48a555b799cc401a9445eba2dde3f  53f9eddea169c133890c2c5062fd66e9c9b2fcd8  feat(ui): add toast center positions and adjust offset for sticky header
2026-04-06  9715b3f87a40e35b19374d6baca9aad725bd144a  9169e60c842daa0c079fb2f3033bdf65f5d74bd3  fix(docs): prevent sidebar nav text truncation in guide
2026-04-06  9815f104220baddb0c34d87fd55cedeee24f4c84  a9532d25bca0b79d8be2797cef0d6e23074635fe  security: harden SSRF, token comparison, CSP, error disclosure, and input validation
2026-04-06  a40609dc936b78afc54b369893cffe8ec6f36a6a  c511f366200fcc09e054356eccc9328ae37a8535  feat(quick-260406-nm4): make header sticky with scroll-collapse
2026-04-06  a8243447d951413021d18e0210f7090040d8f6e9  5e23d8e3c608710582b0db29ba92ffed82436240  fix(beta): race condition between healthcheck and password sync
2026-04-06  ac754259db4a27df9992b2be78f7c682ce412812  c75df92fda85c5c187d6253c069fbb3e02eb978e  docs: add v0.1.6-beta.3 changelog entry for Matter toast fix
2026-04-06  b8dd6856fe4a0f39f58617086d7aba1b15f01c16  70eab92dc84c9b6f9a0d50ba838fc8de95c893cb  feat(ui): make brand logo clickable, links to GitLab project page
2026-04-06  c3aeb62fea6ab597469975d5cf755833fbe5c92a  04a541994d37bcbcd94c4791376c6f9afc4e44be  banner updates
2026-04-06  c61c8812b400c8ea0f144c45d42372ade415abdb  38bf588af1f2fd202d0cf9f547b48613791c95af  docs: expand v0.1.6-beta.3 changelog with all recent changes
2026-04-06  d09e956fe5064b583388bfc94f4bc11bffcb2b52  770b77ceebbdd422334dd6f0133cda3a85581fb7  fix(ui): reduce pink theme gradient contrast in dark mode
2026-04-06  de8f019514c2e45a769eb94d1f6ea3d01fc619b3  28691f470c88b18f2764ac9b2c7416a87e53d986  fix(ui): remove whitespace gap before Scheduled Repair section
2026-04-06  e426924418cf8929ddcb1215432a39d81b3bd0a7  e6a0b35df7085bb3d679ad71c949da60a5312d61  fix: copy migrations directory into listener Docker image
2026-04-06  f5dc9c60e49c53a480b85de55467f2365e4db2ed  1b08b2726daffbd7c6bcb2391f9c6a1368b0c3ef  fix(beta): enforce scram-sha-256 encoding in password sync
2026-04-07  0f48910e3f3e2624dc607fcd6adab1341b043e59  0f51a7ad6161f3a87e81dd2cb2102bb63e35bff6  fix(ci): create docker context before buildx builder to fix TLS error
2026-04-07  2636c484c9745f40389e024905625102df20d4c9  7fd0d44d0af44188d49d7df7a43691a70bf2b58a  feat: make live event toasts clickable to navigate to Timeline filtered by accessory
2026-04-07  2e975aac2f0c145b4bff6ba7a29fc220e12cbc94  f4dc9140c1b3a66b4ff183ea14b31d6df435954f  feat(260407-e5i): make StaleDevicesPanel and AnomalyPanel rows clickable
2026-04-07  42bd4d9bed3ae446a659a67755d9b5cb7863a10e  956c4c7e5973ac07a459f3cffa1d1a150d691f22  banner fixes
2026-04-07  8f34a193dbb3250b2559ee9792d8d39e09c3208c  bd64291b1cd303bf234dee9f90fd6278f52ff80c  fix(260407-p92): restore clickable toast navigation lost during worktree merge
2026-04-07  9327971b4f5fa0b154bc12eacfaf87ef96f2fb96  b395fdb1e0537300f1a50af9a666cf82b4acbadb  feat(ci): auto-create GitLab releases from version tags
2026-04-07  96d3ec281aea8de994ee859d916ccd5c6765ec33  dda7945cdb554d5f3f712b7d2f27101944f55989  feat(260407-e5i): add initialFilters prop to Timeline and handleSelectRoom in App
2026-04-07  aedd6c0ecd8de6b223e4475343fdd08fa21f9c46  c9f89337bc70cc14c3dafd779e752a1aa2f14cfb  feat(quick-260407-c76): add Links section to Settings tab
2026-04-07  bc5ab5baeb2b231e1dc426e67d78bb0f37d3f343  43765f41e98e74722eaa41c003cdf797dc0dab86  feat(260407-en9): cap StateDurationDonut at 6 slices with Other bucket
2026-04-07  d9a0ea71f92fde5ad6b531130b3398a4d4d0b984  a3fdf6f5b85efb2cc39c24b51a9a2119650105b8  test(260407-p92): add failing tests for bridge children in discovered source and on-demand cache fetch
2026-04-07  de001d80be5e8eac4b2485fba5fa8d1394d5d6a7  d120dc318b17775950047b02690f8f30a5d248de  fix(260407-qzp): replace hardcoded blue in scene groups with theme accent variable
2026-04-07  ee52c85e6f1b903dc4a19787fcf4f0c2773963fb  2cb97f69f110c587146eaa629b8150a3aa872d72  feat(260407-p92): show all bridge child accessories in Accessories tab
2026-04-07  f64c7dee7d90893e60481c5cd8990e95f2b66144  3872bbd4d665680ec5fc7e30b39e4afe7ee5756c  fix(ci): remove DinD in favor of host Docker socket for self-hosted runner
2026-04-09  030bfa2e13bc9b54fe0ef37c6bd7736d881c6698  c75337dab0aa77dabb903f2a3113c9d036bcfdf1  feat(quick-260409-bwb): add subscriberConnectedAt override to deriveDeviceHealth
2026-04-09  169a5893e24beaaf7a4b5b41dd9f356aeeecc6fd  9dc03ac2a0a97280366d878c0e3aa67e1d23357d  feat(quick-260409-bwb): wire subscriberConnectedAt into all 4 deriveDeviceHealth call sites
2026-04-09  27b18b5a191f9924290988c37b46198fd08cb583  3516ecb23f168b204338103c658429c0cccc3bd5  feat(quick-260409-nhb): move Alerts from top nav into Manage tab sub-section
2026-04-09  4d2026f54a11db17a06fccc063f331d87b63a599  0fdd8778f15e0a4c8bb1b8674df2b6aa50cae391  feat: add documentation and issues links to Settings tab
2026-04-09  598b0b3e5ad6187d310038ee2e8426c8741a8fd7  d986ff9f0d39d71c6142b025033f5f8f9ae61548  fix: point Settings documentation link to homechronicle.net/guide
2026-04-09  64c06778b17e1754972fec6c524d3cc3532ec026  40441570fcbc46b4e7c0d497f64d0aff16b445a8  docs: add v0.1.7 changelog
2026-04-09  691a8016e91d60f7d9e2b4516932565dd79f0258  7de9cdf01831f5c84bf5139bef609b0b962af54a  feat(quick-260409-l71): add alerts settings panel to Settings UI
2026-04-09  c853d940feea69e9a4b7ca893746b416d9b6f18b  1a5673fc88cbddc4d224210092f5e8f4c9045b08  ui: move Help & Links section to top of Settings page
2026-04-09  d1f2d4bc24d4e3da3ba7f7bed1b4c9267ed9308e  8d4210d67991478b55d290d78b9f4cc3e14a4734  chore: update STATE.md with scene group color fix quick task entry
2026-04-09  f73c91b027eccb3ef7538e28de47a26f0eee6de7  805152e649b8a09bd903853646e0cb7b93bd1b54  feat(quick-260409-l71): add alerts settings backend store, router, and index.js wiring
2026-04-11  2687a99d98527475ffbb57faf3137c18179befba  307c92f2709beb29bdae0712d1407e8aaa58c472  docs: add screenshots page with skin gallery and updated captures
2026-04-11  359088ba8a46bd33a42940560c465ca3cb3c5d8b  339a8ccbc8586e34217ca63640471aeba95fbd2e  feat(quick-260411-uqw): update AccessoryList React key to include service_type
2026-04-11  6305f8dbd55cd65f307a13a76be66b9036f6f349  c7cc04fd72052ceb55a26fa52564c3d472cd213c  ui: enable bottom tab bar navigation on mobile browser viewports
2026-04-11  6c021115ecb670170ea03d5b3c8518e1a84e2c4c  0f3aebd910453bff3f8c6be41c5042e1fc02c1a8  docs: update mobile timeline and accessories screenshots with bottom nav
2026-04-11  7549f773232f7d49d016550b26d861e22a23a38a  82e78c1690ad605857112c506b6aab20ddc6e714  fix: apply security patches to Docker images via package upgrades
2026-04-11  862d60f9a806a84da4a806f0189cc7ab08cdbf32  301b70a587da4555840641e8989717c530f4bafc  docs: refresh all screenshots from beta instance with live data
2026-04-11  ab461de671261ca74807948866d7c1d00805d974  ddf1c41f1f9889725751026401446a8d1b1ce39b  docs: add multi-service split to v0.1.8 changelog, consolidate security items
2026-04-11  b79a11c597a5f5e9e82ed6c455efd60831a1dab2  0e9e80c8673a9ae6b4fa02b6338f23102054ce92  feat(quick-260411-uqw): split multi-service accessories by service_type in GET /accessories
2026-04-11  c8c7182fb7c3ac3547580d038ffaa66d5503cda8  3659d7693295065ab82b7c5f4d12f2e26878d507  fix: code audit and security hardening across listener and web
2026-04-11  e1484be534b2d272a3ede2df6c8209e98ecf9d5d  c5208b82c1579d7c8b22ff6e017ca3de2ccd6fa3  docs: add v0.1.8 changelog — security hardening & bug fix sweep
2026-04-11  fa05d40dd161dbd7ba2a05f100e5ff90e72b5933  f608a53316401dfb99b91e7bc902eb115a16d518  docs: add screenshots page and showcase capture script
2026-04-11  fa39318b2683ab3e151d97fc60887c26111804c2  3a26f26a4c3d2cb07b72df2a903d0507415819c2  docs: fix mobile screenshots to viewport crop with bottom nav bar
2026-04-12  148f9d3c2835f319de6175aa8f251d3a0bdf2c13  df019ef22ffa58e0028896eceec0958d5e488354  feat: make quiet hours events clickable to filter Timeline by accessory
2026-04-12  59be8facf164b1275b352bd926432b20562c4a9a  d0aae059adaf6b7eb92c2fd5b8df347852cce151  feat: replace sticky save bar with floating action button in Settings
2026-04-12  7976c6ee51a935af88d3c014f943a4a1f0a63327  38f1365efa887c73d4e4c8f319938cd298ea726b  Revert "feat: update PWA icons with new rounded-rect home screen icon"
2026-04-12  abb185038bc013528ffe5b747afedafbb7f1827a  53c58d0bd6199f803d5e2eff0321128afc71fb33  fix: add scroll hysteresis to prevent header bounce at threshold
2026-04-12  b5fcb14841857b11a7e52993730ea2196d1492c4  e0cf5543065c4f3c38c33765aa6fa1ab37872fa1  docs(quick-260412-gx7): add Alerts section to README.md
2026-04-12  c5d8d976af106e59e69b9c1423bdb30880417594  798bdf1bb21e69e22aad649981c1ecb247a90de5  feat: update PWA icons with new rounded-rect home screen icon
2026-04-12  fc62d92d8fc3a6d36fd8cd00181de6c604c0e8fa  9a2701b67ba85d5a120f0b7dcc7e955594f51618  docs: combine v0.1.7 and v0.1.8 changelog entries, add clickable quiet hours
2026-04-13  4acc7e14c5f7eb3689b515dda75557a2c786942f  c7b7f850eba702abd52f06d62600aa972136d317  ci: run test job on pushes to main to fix false pipeline failures
2026-04-13  a7198e3a3a3cb44614091a80de7f32e2747c906b  6d484650ef5ad95df6a5aa8a609b4ab40cd8ed00  fix(test): mock window.matchMedia in jsdom test setup
2026-04-13  bf305cc95b28f342ccea9eb8ae97aac94e010f5c  b17ac2e33ccd39277161d2e6cc96eabc39ff2758  ci: add native addon build deps to test job
2026-04-14  028c8f8a4b09cc878d49719c8de081eabbc67c74  c68b750a2d974f69fa7254bf62cc00b9b2877a69  test(11-03): rewrite smoke test for sidebar navigation structure
2026-04-14  08a351524d1c1de6e380027d537d80ad23c0c746  8a25c905b3a8cc32ab0fee51515ec86900088a68  docs(12-03): complete Card layout for Timeline and Settings plan
2026-04-14  0fa3083700d2d7af6cfbc44e4ac07e649cb998bb  1b034538296ff3fce1cb31b5d0e88613cde37958  docs(11): create phase plan for sidebar navigation shell
2026-04-14  1154c37843cce19ecfd23ec44489e86a0eef1139  e95e8decab70f12ec032a2fd69122f8026b6571a  feat(11-03): rewrite App.jsx as thin grid shell with sidebar navigation
2026-04-14  13fd81a1ebf21c88be5f3e37fdd0ede5c679c049  873224c10ffadd1d7f0d8745db81c31120e6709d  fix(11): make accent color picker collapsible in expanded sidebar
2026-04-14  1ef271bcee6d371aa7b5b9f39b535d7da2730fff  d5d8ac8c6d5c1228ac9b65dc94b7dc7430246bf6  fix(11): add Browse sub-tab to DevicesPage with AccessoryList
2026-04-14  24cc8140750755c62a35549f7039b05cdbff8983  613fb21bb1095c9e1d69c5d3632eb9c3de44b568  feat(10-03): replace dark: classes with semantic tokens in MyDevicesTab and AccessoryDetail
2026-04-14  26b4258d3fd4ddf73f473bf65c5d0b5591c86428  e9d145fc8b7f27650f635a8d918440fee9d75214  docs(10): create phase plan for design token foundation
2026-04-14  345e0d0a68443838b21a42fedc0087e0f1cc361a  693009c72e4decef48647c7d1c462a7af886d5e3  feat(10-01): extend CSS shim layer for remaining dark: class coverage
2026-04-14  3f6495ce0cce1e2c7f18978b37da2405d91f5ced  c4fcfb0c200dde544bc7003f841b5cbb222c5cf2  feat(11-02): extract 5 page components from App.jsx
2026-04-14  462f06206bdcb412069e2286bbcc569d564d4388  63c086414b01bcebfa27b33162f5c93fa7c96530  feat(12-03): add page header to SettingsPage and wrap SettingsTab sections in Cards
2026-04-14  484b469139b3892097d53861f11f2f5b558e69cc  b9f484e111b1673b86be03a6336e182350799b10  docs(12-01): complete Card component and typography tokens plan
2026-04-14  493309baa09cda5bd6a3de1c00e4f144f8613475  aa0ca16e279bd301b63d4defb2b002384d78b112  feat(11-01): add collapsed prop to BrandLogo for icon-only variant
2026-04-14  4be23a9810c327b6645a33e9ca335a16eed2471e  9ab2f5e02fc81ca1c4835d87009ebc7e44a625f8  feat(11-01): create Sidebar component with nav, theme controls, and edge handle
2026-04-14  4c509c2d41cfc06152517b8e9d968657f5cd6bea  e05776792fb1af48b41e317f1772eb9fd8ca50aa  docs(11-01): complete Sidebar component plan summary
2026-04-14  529bba1c84f1906789cd3340b695dc74ad874274  4de57fe99a05346e8161c0bfd6f89d5c6f982afc  fix(11): group theme and color toggle buttons together in sidebar footer
2026-04-14  5cb8818eb8e3fdf59bfe53930bde83a29a49b5e8  9261a769bbeafd285a4d63c0cd1cae4eab8f9f18  Merge branch 'worktree-agent-ac8ffb36' into ui-redesign
2026-04-14  609fca356c30958a727bf3eea3d8397c3e96b497  d96edb9e08f1524e366c2e0206302dfe05f9722c  feat(12-01): add typography tokens to index.css
2026-04-14  6ae57d66116c4058199602a62aad128f4c97f93f  5dc750c4cc387e5be0c76ac93528ce1aa9c0ef45  feat(12-02): add page headers and Card components to DevicesPage, AlertsPage, Alerts
2026-04-14  6d49797a9f62faf458c7b16e249db72ded2e49a7  4d40a84db9bf1ef8a3be587bc53cd20a364ad6c2  feat(10-02): atomic rename data-skin to data-accent across CSS, JS, and HTML
2026-04-14  79965eb742a4c32bd6d6812361a83bd4b03a83e2  e81d09d2b5eed48341547b3914659484b243ba61  docs(phase-11): complete phase execution
2026-04-14  7ca6ce03901b317fda5dda89d65c522b20dbabcd  b4dcee6fc16d33e18e36e8823b66841e69ec57e8  feat(10-02): create useAccent hook with localStorage migration and tests
2026-04-14  7e4c2873b2e22e91e79d97122e2f6d6c06565225  22cce5801d4ce3d2fca60ede65f408f38e82cf8b  docs(12): create phase plan for page extraction and card layout
2026-04-14  822e20f4bd8e037ad448fcbedc9d76e8575104bc  2e51147f2c4a589b2ea75571a5de44f5df0dbc99  docs(12-02): complete Card component and page headers plan for Dashboard, Devices, Alerts
2026-04-14  9d34ebbf4b24fff5eb6c9111de1856c63ea34016  d422880810807159446ec5e1fb23b7df9a005469  docs(10-02): add plan execution summary
2026-04-14  ae9f1fef1e04b0c6fd77c716c258010eb88710fc  2163cedd2bda0a6724929c256d9163131ceb75de  docs(11-02): complete page component extraction plan summary
2026-04-14  aee8ac8e2110e093a71694de3d3e29c7c6e21ce9  f14650e0bb88796e7b8e0a594c34464513d26295  docs(10-03): add plan execution summary
2026-04-14  b5c090937c224f32473928185709d88b3f4623f2  f9f86b9def066fd5fb29028ba3486bd717008c38  docs(10-04): complete plan summary after visual verification approval
2026-04-14  c6e3bc9ac4780ebcb7a8905131d2cecfa036b52c  713874ac816825fd34713297705c6efcfd2cd659  feat(12-02): refactor DashboardPage to use Card component and add page header
2026-04-14  ca1c0f405c74aaeff469ada2d99af9076998e257  5931e367c6163db356e57fb82dbb64cb26c654da  feat(10-01): add @theme block and new token definitions to index.css
2026-04-14  ca397ad90b2205c8d7db20e513a4477229916f8d  b4c90197e05d22a314257fa347e41e801ea97b5f  docs(10-04): add plan execution summary (task 1 complete, checkpoint pending)
2026-04-14  cd3c3b361f46668dfacdbb246f87733304ec5b05  6312384bca821a9ec17857a19b5c71736673df39  docs(11): UI audit review (21/24)
2026-04-14  d4e5fc9b82e7d4ed629b4643edd01201f0ec8318  60568fd4c98cc3f76b0ba146189622a27090ec87  docs(10-01): add plan execution summary
2026-04-14  d827569814596485c11854f90dee3048650e65d1  a47577205e1995668b320ee25741c79f6b118b9f  feat(12-01): implement Card compound component
2026-04-14  e2173edfa938b3490c3c1f9be3932777ae2978a5  285d9ab8c2cfb4936b2189d2709ca4f4a8ee32e2  feat(10-03): replace dark: classes with semantic tokens in SettingsTab and AddDevicesTab
2026-04-14  e2d28e5d5c3376f52020588cca0bdb790a4f4625  f5859564dfbe87e6fa6601da6a8181984e6c3d3d  chore(10-01): restore planning docs accidentally dropped in prior commit
2026-04-14  eb8f3436fa129cb513e92905c180ffa0526523fa  68667e21535721f3b3221804a4271058e5c75dcf  docs(11-03): complete App.jsx rewrite plan summary
2026-04-14  f3530ba21f468d2a25d676dfa03408a12e4c9d59  deaca2cb26d01fbefcba49dd46a227cb9ce53d7c  test(12-01): add failing tests for Card compound component
2026-04-14  f4f4b79cb713e338f79e95da9ebc021ff1f06c47  e2e06cd76d362ab32d741f1f133fa43fa8ee922f  docs(phase-10): complete phase execution
2026-04-14  f5e41f55a6b80229a3b840738cc706be57b15e7b  abe10cf99a084ba658b0bc538d92b47efa4ee022  feat(10-04): remove all dark: classes from 20 remaining component files
2026-04-14  ff09605da05149bc9ca6cf420718c103e9c12c13  bfc6c2be6b8fbb59298b96611d8d8b20ba9b9b41  feat(12-03): add page header to TimelinePage and wrap Timeline content in Cards
2026-04-15  00d59ea08fbf78bd05354e0bf3917e097a243b3c  034875fbe5dca0c1d223cdee384e636e7b891910  docs(16-02): sweep all 23 v1.2 requirement checkboxes and traceability table
2026-04-15  025ce0f69af2b35b587ea921b6fa5600a7202f5d  aca3758271d12310dbeb466adb914ffd1de9e1f4  feat(14-02): implement ActivityFeed component with scroll-lock
2026-04-15  06b2579acb9c2cd1a97a19a367d77693959f0c6f  82c0932fe8ca21f1662b6d22e7996512b3f2b3d3  test(15-03): add sparkline render assertions to KpiCards tests
2026-04-15  117ebeffc2f820f0429757a9c6ea89029e86c622  9fba08862d938d22c5c4d74ec3f2a76baebfba1d  docs(13-01): complete responsive infrastructure plan summary
2026-04-15  13c84bd4eed10da16ccb0ce3ca5282866578b006  7b7af8f35a2e347c5015104bb9600b07abab7ea4  docs(15-02): complete gradient fills and design token window selectors plan summary
2026-04-15  16075cdcd2fb3c09b39962dd8d5eda91f42b83ca  871bf0edd0955f224be94360c8ddc83eeffe1f34  feat(15-03): add sparkline AreaChart to Events Today KPI card
2026-04-15  1a496026e41803bcbb6981da7a6b213144d9aabf  8e1ac105436d16da9d267ab9dcda5a3e1324386c  docs(16-01): complete verification sweep plan summary
2026-04-15  21125512f8c5534412892f94fd03cfbda24fbf99  d1ee9a24ca66db927c31a64159e51415633b889d  feat(14-02): implement RoomBreakdown component with health badges
2026-04-15  2275661b62fa35c740903ca78a41ad83e8905c14  4f7a1d058c958b89eb788adf37a5deae2f3c1448  chore(15-01): upgrade recharts v2 to v3 and add react-is override
2026-04-15  2812ff3ae82b27c7f7a6dc35349c96e013a09aa9  cbd4cb68dd7b53f23980beac8fb6c0af61cbbf3d  test(14-02): add failing tests for ActivityFeed component
2026-04-15  2b324c88a1b9ca0504e8364725c29339b4b242b8  ac0db56a92a9cb9da103996b753dbd87cab24901  docs(14-03): complete dashboard integration plan summary
2026-04-15  2ebd1ddf85fdbfccca4d3512a71d0c0b46837dff  931874b2e1130e5de231bb78216b79e22b55f790  docs(15-03): complete KPI sparkline plan summary
2026-04-15  333eb90e5b1360c3de067328b18745ba8c452123  5b2953cceb0b3bb339cd8223b1a7ce0943a0f09c  docs(16-01): create Phase 11 VERIFICATION.md with SC1-SC5 and NAV/LAYOUT requirements
2026-04-15  35abc827d57e5462e5f8f6bb9cd45ecd52812096  5957009abf91f59dbd2e91c53ea173e4d64e5bed  feat(13-01): create useMediaQuery hook with SSR guard and unit tests
2026-04-15  35d0938896bc7c6649a7fe349ce3289c131a9b79  2e020cccb381d51070f7782542bcb3223f5352f4  feat(14-03): wire KpiCards, ActivityFeed, RoomBreakdown into DashboardPage; delete StatsCards
2026-04-15  361e5cdafe6677f9f07d0da492ec0f585d551afe  8ebc81597b893ae7e51957fdaa48c6c32220f2c5  docs(state): record phase 15 context session
2026-04-15  376adfa581aa77dfaf59554e410fe9f06ffff60c  199c698beef7420369012cdfa3430d01f7af0a7f  feat(13-02): add inDrawer prop to Sidebar and guard edge handle
2026-04-15  3826580e39fc6c12ea824829274d87b8d2bae46b  75dcf58ca8d311996c84b6488a0f0f46b48cfbc7  chore: merge executor worktree (worktree-agent-a8854dad)
2026-04-15  388b0d49bc20d8fdedf012f9842d5d9c02d9650d  0f45d6f719ce8eda8a60a9850f981010394266c4  test(14-02): add failing tests for RoomBreakdown component
2026-04-15  38afdcf74676b25cdc0ddead3e9cbbaaab8889f6  8eec19319830217b27f77714eb1daccd5b837098  docs(17-01): complete AccessoryDetail Card migration and token sweep plan summary
2026-04-15  3c875ffbab7cec5175ea5acbeb07cbe0427973be  dc909c0a04c9302d407cf5f6680ba5df330a5ccd  docs(16-02): complete REQUIREMENTS.md sweep and ROADMAP.md audit plan summary
2026-04-15  3cf8823779672069bfd830ed9ecca27207b4f993  b0eb1805ec9b4ba34a535348fb3999aa424b92e9  docs(13-02): complete Sidebar inDrawer and dashboard responsiveness plan
2026-04-15  3f81ca79bf621ff59daedc9f9ae8ce11f87df384  543947a3de5b5df98b3f1f3a4cd96a68f19be780  docs(15): capture phase context
2026-04-15  3fb252be0944f82a98cfeddd37972b674b2e0bbb  32a83178a6458c8895902fcdcb6b53a6c1f12f6a  feat(14-01): extend useEvents with optional limit param and update queryKeys
2026-04-15  3ff023bd45819ca4f222a25ff3ef21375e7fcf78  4af48a6a8e31e0716d450571cc115fc732529674  test(13-03): update App smoke test for responsive sidebar behavior
2026-04-15  47245fd3186ca5257425a8e32409086a3d4ea6e1  dfd0f92640f0d195208f434b35cc2ab4027e7fc6  docs(17-03): complete token sweep for 15 remaining component files plan summary
2026-04-15  50996bfd6ce0596282e903438dfd50052f0e4325  f4b094770bad9fb8fe6565c6807f94d20cbdfb28  feat(dashboard): restore original KPI cards (Today, This Week, Top Device, Top Room)
2026-04-15  56278e496d0e804364e0259c0029e55ecebf0aef  1d5294899d224b9b927ded1d710cc975236dce19  docs(17-02): complete medium-density token sweep plan summary
2026-04-15  5741f1b6294b7be9724b8436f1ccfcd501e5dd6b  3a1fcb079d84e89073fc8c33c99ccd096616e0da  test(15-01): add ActivityChart and TrendChart smoke test scaffolds
2026-04-15  663fe7a259d7bb7230f14e2f2076b1d796092306  feb520b417933f0dbd7f70641ef0f9ea5bf6580b  docs(13): create phase plan for responsive sidebar
2026-04-15  6d45d9821d2f8da8179f375d600d5cb8df0cdb9a  1257c915667bb7a24d5fdb4ce9d1c8470b35d935  feat(13-01): remove dead PWA/standalone CSS, add drawer rules, clean JSX refs
2026-04-15  76a168beddbd2a849afc83394a2ac4b89c6f9a61  0c95adb87f8ed6d5f0f53f2e518de56dbc3eeb66  feat(14-01): implement KpiCards component with health counts and trend delta
2026-04-15  78cbbc5c82f4df48ce432abe174e1379d48828b4  2f823638620818951b6e0262e63c5ac13e004e23  feat(17-03): token sweep for timeline and list components (5 files)
2026-04-15  7a410773ff370753eadd911450bed38bef9dc389  676d77e27506bbc7ffcbc398c05ad4823aaf8094  docs(14-01): complete KpiCards and useEvents limit plan summary
2026-04-15  7bf7aa97a5c7c6eb462bbd641aa446501e776564  bd1253c58134b3776cf5702f5b4a557714831443  docs(15-01): complete recharts v3 upgrade and chart test scaffold plan summary
2026-04-15  7e7b778333367b1c69d995e8aaed2636dcac93f3  1ab0d7a47fc81e90b76e86688a40392a715ec195  docs(16): create phase plan for verification sweep & requirements update
2026-04-15  8ab2d68c5ef32ff6a051d1888959b3f93618f609  4d2817df53d897e6785dd566d26e48fe422351d7  docs(16-01): create Phase 12 and Phase 15 VERIFICATION.md files
2026-04-15  8d210351594aa26094e63c61095e662eafd5920c  0bd8f66589fde5594d50ddc8cc5641f4c0f231cd  feat(17-02): tokenize AddDevicesTab, MyDevicesTab, SettingsTab
2026-04-15  9176c2680dd39422742fe3765b95d39fafe48198  a4a529a919f62ab1812d3b977a2ac7b068b1ff46  docs(roadmap): add gap closure phases 16-17 from milestone audit
2026-04-15  9bd8688dd388e9410d1dae69d2d2c37ef9975e4f  7ed1c4e5d3de35768310c29e3963ff89401be7c4  docs(14-02): complete ActivityFeed and RoomBreakdown plan summary
2026-04-15  a027bf95ef71360087549f823f0e5c5a017e053b  69000e3f990771ef35888807fbe71219886626ef  docs(15-01): add self-check results to plan summary
2026-04-15  a0ad0ea5b800e340ecbcf054f5dee13b3762e03b  3141eed98a0c4d994dc85a7e3bdb40aa1fca4a38  feat(17-02): tokenize AccessoryList, PinHelpModal, MatterHelpModal
2026-04-15  a288d92266021df87a6d1d44c3191fea2f3b5438  1af8e6a3e8587649ef741d748a72fc7cc5ec29ea  docs(15): research, patterns, validation, and 3 plans for chart styling
2026-04-15  acddae580186dae99b02062fadb0fdbc596ac4d3  8cd1371c87dda463f02864f3a68a23e7d31fe035  feat(17-01): migrate AccessoryDetail to Card compound component and semantic tokens
2026-04-15  bbb4a6d49a3c968436273338cfd0d84086a31a83  d37789331992c85084beae86672855dc2a6ae160  test(14-01): add failing tests for KpiCards component
2026-04-15  ca9f297040328bdee71e3b9ea305d6f0c16314f7  65496684cf5d009a86e55a07390630e253dd68dc  docs(15): create phase plan — 3 plans in 2 waves
2026-04-15  cacd79a427f0f0bf3a34f5affa7bab59d453d29a  d65f82459d1f80046e8bd24c419600d366aca92c  fix(17-04): replace remaining hardcoded gray classes in BridgeChildrenRow and RepairFlow
2026-04-15  cfb9e8b758401c8b891c48cc8b7cecbccdc542d0  07a96d568194abe39ac8f080be1821c75afe3a73  docs(state): phase 15 wave 1 complete, wave 2 pending
2026-04-15  d015b9a84a5e262d9f44fe4649b775b851df3303  45dc3000302975cf88abd9168d90181f413f2d9a  feat(13-02): make StatsCards grid and ActivityChart height responsive
2026-04-15  d042ba4869b70655734fdd6dda9610ac3b31359d  577ea45058a3106111b575ca0f4e71128384120f  feat(15-02): replace ActivityChart Cell pattern with gradient fill
2026-04-15  d1cd6ec8ff9a2303ce93659ec70258496dbe9c8b  c4c8fb3012e25f8f5e5aab73c1387a0f19af2aba  feat(17-03): token sweep for chart, heatmap, and utility components (10 files, CHART-03)
2026-04-15  e05bd0ea86736085d039ae084a883e8e063b400f  4f94da57b3ffd61e793e961154b0143a45ddc8b6  feat(13-03): add responsive breakpoint logic, mobile top bar, and sheet drawer to App.jsx
2026-04-15  e0b75aa5fca53a546e1ad3f99022a73e15bb7c27  83bb4e2d4db355d5522eeb85d0776277686572c6  feat(15-02): fix window selector tokens and AccessoryDetail chart alignment
2026-04-15  ea22238a968ceb43d4f474de92f41410887fa82c  2aee640ab17c5136d21e0ef801c7243a9ddc4dea  docs(state): phase 15 planned with 3 plans
2026-04-15  eb1645596b77efe8edc6b75a9d07c3b25dc20809  7a11b147603a500046ae40039491f72cae7f171b  docs(15): UI design contract
2026-04-15  f2083ab99302237c569f432e2df3827e9b7a5cd8  3f03522a2b1b58a79b1fecf0975323cd95d5e0c6  docs(17-04): complete final audit and verification plan summary
2026-04-15  f6199530680babd697ce703394dd4a0516e5d430  dda51d322a6c35051ac7e4deb2564cd6155902bb  docs(state): phase 15 complete — all 3 plans executed
2026-04-15  fc71f508cc07401453424093bb919441ec34bbf6  d9cab6d000c372c1f5207c0b84eae9d3f7b079e1  fix(15-01): add ResizeObserver polyfill for Recharts v3 in jsdom
2026-04-15  ffdaf3b3c448b9f7f789ec6eb19483c5918c536f  938c0b0e443429b1fd6057348098cd04be934ddb  docs(phase-15): update tracking after wave 1
2026-04-16  1c5f67fdbf90efcc545f4924f891c1408f91a19c  446001a3153255678325660835cbf4b0afcc1a8d  docs: log quick task 260416-td3b (homechronicle.net screenshot recapture — MR !2)
2026-04-16  427cd9eff037c25d49e9f78128f058bcda4de62e  c14692cc16efb70bcc55fa1604787f2327e1541e  docs(site): recapture screenshots at tighter aspect (1080x720 clip)
2026-04-16  b51e8a9a20b1cb81f9416b9a9a9fe84371f1bdaf  60989ac26e02399e98cbb193fd25f7ab0bbf045b  fix(site): cap feature-row screenshots at 520px and drop settings image from pair section
2026-04-16  e6a77404a0993dc1b21a958510e823685c1e4044  ab5e19b359f6fa2264a6af12dc2b8aebc01a3d2a  docs: log quick task 260416-td3 (homechronicle.net screenshot fix — MR !1)
2026-04-20  0c97df7ddd3f33492669eadb7abebd6fc9a4c945  2e7870b6c88f71febca843f5d5505e675e064469  fix(18-01): restart subscriber and move resetSubscriberStats to success-only paths
2026-04-20  3e0d56f4641da38a3a66410966c57e39f4c197cb  10dfe29028879d68d61afa4d50eeb93385b83cf3  test(18-01): add REPAIR-01/02/03 tests for needsRepair success, failure, and isStale regression
2026-04-20  5d843458394ebc6fbdfde6c6f3c39098ec18942a  17c9922ac439b8e92cadc863d403e576368ddf9f  docs(18-01): complete scheduled repair subscriber-restart fix plan summary
2026-04-21  0022bbea4bdedcdbba3515994aaf13503d0c695f  8ccf4596b589d56668cf94f66a34250350d517de  chore: reorder dashboard sections, archive planning artifacts, add playwright dep
2026-04-21  0a2bea2d2bd97333a879a878376da98202dff180  bfc7864bb78e273c866913814c5e705b858c5248  feat(ui): clickable timeline rows, flatter timeline chrome, alerts nav feature flag
2026-04-21  107c008ba034427d8e89281ddb732acff5085bdf  28a8ac2eee7e808c73360a244177cb78085d5081  feat(19-01): wire pairSetup path into repair scheduler
2026-04-21  10e4912aa2c99139ffd1b10f671d30ff9503b7e7  7778656abf6219e8b46c86b873762725e3031a8a  fix(ui): route live-activity row clicks to filtered timeline, widen Devices page
2026-04-21  2e915f219631a07224b067f7cda446556f5a9cb6  af9ae834f084c125a986f8263abc4698af3b7232  feat(19-01): add performPairSetupAndPersist helper in repair-helpers.js
2026-04-21  42e0bdeb18b694c81e7db61e5c3ae590848acb3d  995c475eb20ff555915d24a07de045e2ffdb7a36  fix(ui): activity-feed navigation, room-badge contrast, system-theme icon
2026-04-21  64cf6b2ecfd563de62d7bc5d8a8c11cab7f5b5c1  e595a2e907b48acc3d364440380de6a17ed59033  test(19-01): add failing scheduler tests for pairSetup path (REPAIR-04/05/06)
2026-04-21  8ad609b46a55aec8d07abf922a51bd9110e201ec  91cbed6f43b10bf0543abbae1f8e58af0799585e  test(19-01): add failing tests for performPairSetupAndPersist helper
2026-04-21  c199e602d81e7eb77914db5460944619b5cdb13c  6655f9003aa92fde8ea8c92dede2f953f0ce3097  docs(phase-19): add code review + verification artifacts and mark REPAIR-04/05/06 complete
2026-04-21  da713f45f34cfa2ca2c2a5612e8177b7b8afbaef  42e8693d2ede10c2cc10f046d8939163dfd5ac54  docs(19-01): complete scheduled repair full pairSetup capability plan summary
2026-04-27  02a21cb8e1b7a91db4891fa752a95cdbd6c099ca  0327f4326f1fd287304a7a59ce6137651a0c2052  fix(repair): thread subscriberLastHealthyAt through accessories-router
2026-04-27  5efd34c3e9b2062fd399d5111cf84946210e605f  a4d3acb7323bd062e3a8476ffa981dd4a0f8cb23  fix(repair): add lastHealthyAt heartbeat for active HAP subscriptions
2026-04-27  725a9055330bd157719e96a51cba5d49e64b4702  950d5ee930d916fda10def589cc4ed14291dfa4a  fix(260427-vch): close quiet-device gap by threading subscriberConnected through health rescue
2026-04-27  9d4b7d55d9ecc1ae3782fa7ef6516a0f47162bd7  1fe2b24d17382e93ba9d5c6b70f4d06ce3957859  test(260427-vch): add failing tests for subscriberConnected short-circuit
2026-04-27  c6cb358dff3cdd63d9301ec56e59920751cddbf2  aa13a52fe798e40d2eee83b17db26e6795bfb47f  chore: archive v1.3 Repair Reliability Fixes milestone
2026-04-27  d55ad776cf65fcb1b078676eb2459bb63a4febb4  5acdd1d1dadf52cba04218fbb0ff31ddd3ebed95  test(repair): add failing tests for lastHealthyAt heartbeat
2026-04-28  0d9548987375a78c9eb47cee8619a955300d0f4b  9c90921f78de9126caca807d5d73dfa883eacefe  fix(ci): use subshells in test job so failures don't poison cwd
2026-04-28  294dc142772c9c338e05dc0cbb4cb07a6a13c461  f1191d039ef39958336903e9a8104bdebac50e90  fix(ci): set DOCKER_HOST to unix socket for build jobs
2026-04-28  30061466c4764386e07e1d723e7270195b0fa03d  962c87a41367069b4c471b5167977bb4e0b06b45  test(260427-wm1): add failing tests for KpiCards H-01/H-03/L-04
2026-04-28  358509c809fe4841643c964cf71c0a267dcd60e0  89b087e6b3a92d266cec557455d3236838683672  feat(260427-wm1): make KpiCards window-coherent (H-01/H-03/L-04)
2026-04-28  3ffc42e1d6cd85a06c32be38c2f8f5042d8a79a6  b3a7efbcee3484994dba6cff197e6d76913fb70c  feat(260427-wm1): tighten subscriber liveness gate (M-01)
2026-04-28  6a77da9ac792afcfdb78c23084775717d50983e2  4de673fca5ef0538ae855b9ef4b0c576d2aa8d39  docs(changelog): v0.1.9 — scheduled repair, stale-device fix, dashboard truth-up
2026-04-28  7d83d8b7bdd6ec8f307dba74b37529b128416c57  cf4c45b04124065e8a62056833237dfdf8a23f5f  fix(ci): bump vitest testTimeout to 15s for slow CI runners
2026-04-28  90e2cfc8d57743a1fc6b5a3237f777a9801191e6  722d6b7a534f750c79088b1f394ef95b736512ec  fix(260427-wm1): remove nested interactives in EventRow (H-02)
2026-04-28  9421be2a2b9d97a37d9128090be3d13943e671e5  86e1ec5d84250842978865f20edfb30ca698c11b  fix(ci): allow api-source pipeline triggers for build jobs
2026-04-28  9c35ffdaa7ee7667f32ed155fd5170ce0c86b955  66d6784fe51f9746c2a6dff5a05fbf7a952b2ed2  Merge branch 'ui-redesign' for v0.1.9
2026-04-28  abe3e131a06bcb960937a53b53f0b84547236ddf  41062cada965f4ecb969d7f0173f431f0be482c8  chore: log quick task 260427-wm1 in STATE
2026-04-28  e4678929ed48617d301b5240ff0cee8b95c95d2c  7de33969ae1a9228758b0a23775bafb7ae05ba49  test(260427-wm1): add failing M-01 tests for subscriber liveness gate
2026-04-28  fef34ff5f73c49b196132c677d3068244ea485b4  17090983421e40ceb64f1166681d1ff3f09f404a  fix(standalone): set ownership at COPY time, not via post-hoc chown -R
2026-05-15  55eede9464def62fa35f06ebecd3eed2f6879c61  f72fd319b41283c4dda3d1b3331f3b2cedac5c45  docs(quick-260515-nfw): record matter.js logger fix in STATE
2026-05-15  92cf90f6722ea48d4b0a989b88d6a67968e6ccbf  9cd0bcf4fc5eb53bb2236b31c1a0651771b4009e  fix(web): bump sidebar brand logo from h-8 to h-10
2026-05-15  a22b1f7cf38c741ea514e3aa8858abc47a832f08  979eb5d4e05f3c4ff040000ea1539e1f7764f026  chore(scripts): add sync-prod-to-beta.sh for refreshing beta DB from prod
2026-05-15  c60ea2659b4c8987fdb36069fe3a78751f6c1c0e  92742dbb34c536b0a14f0deea39f9060059a6e50  fix(matter-controller): silence matter.js DEBUG log firehose at startup
2026-05-15  dc404fc5af35604e36c8b3d220fd69c0469316c9  a30f4c25728c68636d5291f0b31f99f86e08abe9  fix(subscriber): stop infinite 60s pair-setup loop after successful auto-repair
2026-05-15  e819b82d610679537bf605e7eb3e60315e555490  9c2fac46adca0864c44e4723d217d161a13e1995  chore(changelog): v0.1.10 — fix CPU regressions (auto re-pair loop + matter.js log firehose)
2026-05-15  eb8c9ff179f9b86c234539b0f7c0b384ef839da7  eb3701f51a87c8d99af09f790c2db0764594d83f  fix(web): unify page width via shared PageContainer (max-w-6xl everywhere)
2026-05-28  5b6910a3532481b07470849c230b2f9355c2b15f  b630195adc7bc083bee27c564e99b3211583e706  chore(release): v0.1.11 changelog
2026-05-28  890f9a0bf937201a5b9aa15e0ee0c9c00b424421  0cb0ef086becb0648357751787afdabed134b052  fix(listener): patch dnssd readFQDN with cycle guard + 128-iteration budget
2026-05-28  ef357c1cb4cd5163a85f7be273b06274fa486636  512de092858b5dff678f41e4a4d34fed3fb83099  test(listener): add failing regression test for dnssd readFQDN cycle guard
2026-05-30  0a3720321a5fd7406a80d4c61432babcf5797799  0dcf83da74fd73aeb61aeea02768d7e6dacd1ada  fix(web): Live Activity feed fills its panel height when resized
2026-05-30  29dfdecd71275baf9f40a890c8c38d23ef3afab2  1b9d9d20a5456d8337557f9a6574a3ce925f4b1d  chore(planning): record v0.1.11 dnssd task + park telemetry candidate
2026-05-30  d52f84d35aacca91a9169ba1372051e0a3478f8f  5609f5bb5264842ff2bbcc7f71c426485438f918  fix(web): clamp dashboard grid wrapper width (min-w-0 + overflow-x-hidden)
2026-05-30  da6c4f30aa369c44e9bdd12703d4b98e6cad103e  e6f5fd88cd9e2a35de51dfd3b27c0eb6c1427951  feat(web): make Quiet Hours a grid panel; regroup dashboard controls
2026-05-30  f2d22d80bfcec6a323439ff2c6856284fce735d9  964157c7be32854b4c3c71e2b4600c0f68511e56  feat(web): customizable drag/resize/hide dashboard panels
2026-06-01  01111232f50deea217266c30f01b8ee4a32031fc  2c1f84f6a7bc82f75276464b56bfc94df9cdca5d  docs(state): record quick task 260601-t3z (7 optional dashboard panels)
2026-06-01  16f5cb663a6c24eb65aa700c55df1f7a391c97e5  ac2269dd7deb6c718efb6b1fb5aea21ad1f90eee  fix(quick-260601-wsv-01): Task 4 — fix inverted Top Movers status color
2026-06-01  18757b57064e22f6f9240ee38d4ae3cfa824612c  bf1133655e5070f0acb8032657c63c1a50a68e63  test(quick-260601-t3z-01): fix previously-shown panel fixture to mirror lg/sm
2026-06-01  36ee1b77afc451fda7d8b931586ae86b96850e65  d508591dac04881c49951323ed33cf42e3c292e3  feat(quick-260601-wsv-01): Task 3 — right-size Week over Week panel
2026-06-01  4de94a7efa3afdb230a6978be8b997853805a1de  e3f2de08b0dad1c7f317637f4e9facc9c64e539e  feat(quick-260601-t3z-01): add 7 optional dashboard panel components + DashboardGrid wiring
2026-06-01  5af8ad8bf05b203f6c595805d7aa3b11516e3e6a  f61e41c8deb551da6eb677dc30a4bcbac64a8629  chore(scripts): add unattended beta-sync wrapper for deploy hook + cron
2026-06-01  5d597f1a98416391fd34a1a3335fdc7c03750e83  1cb3f4027d453597169fe47095d70a6a067e5a8b  fix(web): Quiet Hours dashboard panel fills its grid cell
2026-06-01  9d7d78791a69482350365aac47509ef464a51325  36766c16888426f93f4ff09c4df64dd6d8d320ac  chore: merge executor worktree (worktree-agent-ac8fe44c1ec5f7b68)
2026-06-01  9fa0741aee0832dce5ecb9bfda9c21188474af0b  0ce530544037777252c48ead599bafc79c9a6f9a  feat(quick-260601-wsv-01): Task 2 — replace Activity Clock with Day vs Night panel
2026-06-01  a302c68df620385d9ef1583fb2ed8c02be0924c7  5051455c1936a9666b9fe8985894df1b057fb30c  feat(web): make pairing health banner dismissable
2026-06-01  b7523b164309927fcd89fe76f7bfc3a20d98fb35  a441815c1428dd65dee79ee92ecdbe3cec03cc6f  feat(quick-260601-wsv-01): Task 5 — Customize button icon-only when idle
2026-06-01  c2f59f49a3e62311de957869bb6b4e0857728138  982dbbb4b842dfafd03938e8c4c8708aa69b81a2  feat(quick-260601-wsv-01): Task 1 — CSS-driven Quiet Hours gauge theming
2026-06-01  d3f15e0c9b9cf2bfd0439d3a88aea638db1b822f  854bd71ddde2deec6c342387f01c7bbcb39826fa  feat(scripts): deploy-beta.sh drives Dockhand sync API + prod->beta refresh
2026-06-01  f2292c209dcd378e224f555a9f2f54210703f3bc  c254bae2509b4a3f12b2d340509b9a206b1a58db  test(quick-260601-t3z-01): extend unit tests for optional panels + seeding behavior
2026-06-01  fa7a8145b7fe1d3360389a0a4dc9a63b6f054d81  5e94a9765de56426e1b7561019bebf3a20ee2e66  feat(quick-260601-t3z-01): add optional panel flag + first-seen hidden seeding
2026-06-02  048bd61b68ef60145fcac29625794eef6d27a4ed  49d7aabb0d8d8c23c42fff45788e8e1661bbcaa6  docs(state): log fast task — beta-sync cron PATH + log fallback fix
2026-06-02  061ad308b67c7c4345e9152c2ac76f2a27b70978  019123c47ca7b1a86fe7a1b423ffc6607e5aef0b  docs(state): log fast task — Week over Week maxH cap
2026-06-02  15ff1d6f3cb5803a454b02ced43df9bf7449011b  aa96bc92bd1f74ce31256ae0cec96341286d6e81  chore: merge quick task worktree (worktree-agent-a32cc56a1d332796c)
2026-06-02  25e69d3773e3745f64e49aadd484d8f1115438a0  d2e67884706eed9025cb58be388700397cad4824  docs(state): record quick task 260602-l4c (in-stack db-sync service)
2026-06-02  29aae62d9d99248cbd297010ba5bc694b6d2426a  35a8a379a78017aff8562b0639041a35ddc42ac4  feat(quick-260602-l4c-01): Task 2 — add db-sync one-shot service, sequence listener
2026-06-02  343802f25cfdd1bc9ec1f083ef32c38f58d768d8  02a62adbe7160a55126bb2483effd9a51451aa9c  feat(quick-260602-nb9-01): Task B — move Timeline filters into header; align to max-w-4xl
2026-06-02  4103761b2f18f4beed253e78b2dfb9792956b52b  ef04a97dec1bd30134f5bb5025b88dbadf61c411  docs(quick-260602-l4c-01): Task 3 — document PROD_DB_* + SYNC_REQUIRED in .env.example
2026-06-02  4b54b7461c32445b9866759fddf5f0042c7df385  65ea7a9477265f7309d49ddc85da9388e3e58917  feat(quick-260602-g92-01): Task 2 — 4 query keys + 4 hooks for Tier 2 stats
2026-06-02  52125939072df6a837d702f2d0d81bccdbb51444  5fff1a410107fad35d1508663430c1d611befb8a  feat(quick-260602-nb9-01): Task A — medium centered column width; drop redundant Devices card
2026-06-02  62210ba10b6eeb10c210010432bd5689b700f6ab  b4a8fbaeb8d03d19ee3fd2b39784d1eb543d1d31  feat(quick-260602-g92-01): Task 3 — 5 Tier 2 panel components + categorical donut CSS
2026-06-02  7586f77082dd4e91012e51c0863ec3c20fca1c2a  42d8094ea8fe011ce47f79f82cb8920d5a7add49  docs(state): record quick task 260602-g92 (5 Tier 2 dashboard panels)
2026-06-02  7691e254f4151599344e2b149dda9421cf3eaf55  25189432b2113be5c882a6c83aac1b8b6bfd3bad  fix(quick-260602-nb9-01): keep FilterBar wrapper full-width so header toggles align with title
2026-06-02  805f86d7196fd6807fe18253c9b8fd2e0a3215ab  e71db8205e425b9a49b7d15c8c8e9bdd3685e577  fix(scripts): make beta-sync cron-robust — explicit PATH + writable log fallback
2026-06-02  917e56b2086a6d45318d011f8bffe783be762496  e253542befebb47f1a4e2e3f1c7f42ec129ebb4f  feat(quick-260602-g92-01): Task 1 — 4 read-only Tier 2 stats endpoints + tests
2026-06-02  996dbb0cb8e22aa09e8f54a301dabbb621d892f5  faf8f95a9836391b4264b7e6d58a3c509489455e  docs(state): record quick task 260601-wsv (gauge theming + Day vs Night + fixes)
2026-06-02  a8b5f2a6db41c9228bb7cd01137c3ffd23e1f125  9a11624794e91eff253f28a6aeb953eeeb9a437d  fix(quick-260602-l4c): missing prod creds skip sync (best-effort) instead of hard-fail
2026-06-02  bb198cf69e23652e403eda16c71b1799b8f24a64  f4c93d1473eaf2e58cb7a5bd6ddf783d0a3f324c  feat(quick-260602-g92-01): Task 4 — register 5 Tier 2 panels + wire render cases
2026-06-02  c5748aeb0359f702a8593f41c8759f2bb604f950  d5abaaba6143da6ad507d53d699d9df44874984d  test(quick-260602-g92-01): Task 5 — registry 7->12 + 3 Tier 2 panel tests
2026-06-02  d69c5969c95d2aa24f3f3ecfcf89a03f2589ee0c  afbd637bd4f494e10a7c8ec92262141cd336e513  test(quick-260602-nb9-01): Task C — net-new FilterBar.test.jsx
2026-06-02  e3f34a309da55889e946bb56d73ee9def3f5f116  dbf970a03362ec4156714c8f81dc0789e24be823  fix(web): cap Week over Week panel height so saved oversize layouts clamp on load
2026-06-02  e4ba24990bfea3361b3eb08cd427711dbaefc383  d1eeb7ed161a97f416b539623d6a8b69b44d1001  feat(quick-260602-l4c-01): Task 1 — beta-db-sync.sh POSIX network sync entrypoint
2026-06-02  fcdca3a81216c0b42baea8038b9ac20e202dd648  6fc632b1d56326b4786c461a3f7b2bb515ad7849  docs(state): record quick task 260602-nb9 (page width + Timeline filter header)
2026-06-03  19b5dc40e579596445848db5fea854f0f592982f  653ced57f5ec19cd66ba1c90bfd446f8d6a3fb8a  build(quick-260603-v3f-03): bump web nginx base to stable >=1.30.1 (CVE-2026-42945)
2026-06-03  2756d30689384d73df4308a449664a606447f135  a5cde087c4a1805fc712175668473d3d57d12b8c  fix(quick-260603-v3f-10): preserve webhook URL when editing an alert rule
2026-06-03  382c05ac5c779a68668b50c9ee91598bcffde1a3  d1cb648b6f81c66ca95da87de4bfd7ca814b60b8  fix(quick-260603-v3f-06): redact webhook target_url in GET /api/alerts/rules list
2026-06-03  3c69c8c2237ad8a5cdbe8af3b0d4b86e85af7bfb  1dce708bcf69a37ced6efbcc89436bf1d482a581  build(quick-260603-v3f-04): drop curl/dns tools from listener+web runtime images (unfixable curl CVEs)
2026-06-03  40ca7a9bda950ccac91ec2d73edda2e251c0def4  3fe65759d2f7b0a939dfc6639a2c657a3612b9ed  build(quick-260603-v3f-09): override listener picomatch to 2.3.2 (GHSA-c2c7-rcm5-vvqj, GHSA-3v7f-55p6-f55p)
2026-06-03  70fdb902a207b310ded4cd4c7d18862a6a95da59  a8f5f26fab01141313eb2c89e072275b2f9dda9c  fix(quick-260603-v3f-05): block IPv6-mapped IPv4 literal SSRF bypass in webhook validation
2026-06-03  8d60c6fd1d2982d604f22d16ef2918e41424ec34  a0adb2fdea2cd12dbfcc32346c1ec148e4b0795a  build(quick-260603-v3f-02): bump web picomatch to 4.0.4 (GHSA-c2c7-rcm5-vvqj)
2026-06-03  a6ce5bb03d6f907647b775eaac8b4d1f01589ff3  1de2e19190403d72eeeb8d36dcb8ca7c84840011  build(quick-260603-v3f-01): use lockfile-faithful npm ci in all Docker stages
2026-06-03  abdbf9f1c019131e1e4df4d5f5ae7fd166f94459  e8e3fef8bbdbae2a3e5e376ef724e409e7c05703  fix(quick-260603-v3f-08): cap and wrap /matter/events bulk insert in a transaction
2026-06-03  deb54c222e08e5ed6b33e0b926585ccbbbf78300  175f1de435ae6a61bda57f92dee1304af45497e7  docs(state): update 260603-v3f record (commits 09-10 + corrections)
2026-06-03  f51606fbdb1fcc465eae892f9beb55690b034e25  f9408caf13d555d2df272c0826c9433fb7cb97c9  docs(state): record quick task 260603-v3f (security & vuln remediation batch)
2026-06-03  ff50c64d50f69b93b3154c34013c7a6453449c28  b7b3cafef9c2a854e18cb70807c8d9807f157164  fix(quick-260603-v3f-07): bound /api/alerts/deliveries page param to 1_000_000
2026-06-04  d97b0cb41939239b1454560ca8bed0e14afa6e41  e9d2068cbec146059a4a6779197cb35ac63767c8  build(listener): override path-to-regexp 8.4.2 + tmp 0.2.7 (GHSA-j3q9-mxjg-w52f, GHSA-ph9p-34f9-6g65)
2026-06-07  df42e3435792735fba4a07511c713631763dca08  00e8d9f46efee0211c36705ea1c445bdc66237bb  chore(release): v0.2.0 — consolidate changelog for dashboard customization, optional panels, page-width, and security batch
2026-06-08  08875ba843e86745ea1d4202ed2e038fa855ab11  c3c0189e76d2799e8f2aa2f9a594f32e3d7f2b66  fix(ci): pass changelog contents to release-cli --description, not the file path
2026-06-08  2256ba0ea17ca61184be086c48bdacfaa2c35ea6  425996249d26f9e81f09ba4f35d2dcd50e47264d  feat(quick-260608-fnr): add deploy-beta CI job for Dockhand async sync
2026-06-08  31f5e5c36e1cc92695796c95e6058c44ba9af2e2  49880d62c34e1534483850f0104c1996abcf4980  docs(state): record quick task 260608-ffr (fix create-release notes) + f4h CI-green
2026-06-08  6adcdfb56db138343187659703e477079689bcc3  44718e6e6ef9210d2f0d6799505614b53c8eeaed  docs(state): record quick task 260608-dwu (rewrite release skill for GitLab flow)
2026-06-08  7b067149a7a898adcb22d4e509abc3fac4623cab  1b716e5b65883fd4ee089df1e06b9b08f4e5d215  docs(state): record quick task 260608-f4h (fix flaky dnssd-fqdn-cycle CI test)
2026-06-08  7c90f50c3b5a6c628d455336653930499e32acd6  6e26ee766a1928a10649e5287f675fa13fbb051b  test(quick-260608-f4h): widen dnssd-fqdn-cycle worker deadline 1s→15s
2026-06-08  8dd751b235a5063995fa9d9c4811107f2ccfde75  873ae08a72a5b1da15bf0125891e3a718079413b  docs(state): record quick task 260608-fnr (deploy-beta CI job via Dockhand async sync)
2026-06-10  06e40ca95efe4adfa5942846333e536fd83e88ec  0a13c2724db20fe607ec36f5cd98be2dce86b3fb  feat(20-03): add hashToken (SHA-256) and generateToken (randomBytes) to security.js
2026-06-10  123cb703d8e4a7582a9bb931b1165a41a6254a1e  e9c0141b5d7f27207dec9670b22faaa72c51d2e4  feat(20-08): add createAuthProtectedRouter (GET /me, DELETE /logout)
2026-06-10  141f5872772966c0ea86731d30573c49cdfa177a  caf99b55f2c887f0504fb3549e9ee34b98d56128  test(20-09): add gate integration tests (Task 2 RED)
2026-06-10  1d65c82b074e431e4c08286a7651cf01fca123f4  bb4a82eb1076d0318db33eafcd3c274a5fd79137  feat(20-10): add LoginPage and ResetPasswordPage auth UI
2026-06-10  1f808ec9e5151e697a6d8a004ff22092480cad80  58f4f0ac6b2c28596a20905b8296eca1529e7143  feat(20-09): wire auth middleware into index.js (Task 1)
2026-06-10  2d5817fe4b916739442cb344d367aebe24267fa9  2d253efca8c367500664c055ccbfbb3526bd7486  docs(20-11): add self-check PASSED to summary
2026-06-10  2f290cfefdb985ad40290a4c431d6cd10c251f37  efe546035b02ede8f5ff123bb68e73377aabdd23  feat(20-05): add credentials:include + X-CSRF-Token to fetchJson
2026-06-10  4ad3c11a645f4c000dadc7da9389da12ca2965fc  6ab050e4bf043438a2b142a0965888d160c46e90  feat(20-11): session-first gate + CORS credentials + skipCsrfProtection (Task 1)
2026-06-10  526c3875f40d0176fe9322efff54a2ffed43ef41  de36efb5808fe7bf2e94e756b3b33b79b565af23  docs(20-11): complete gap closure plan — session-first gate, CORS, CSRF, /me fix
2026-06-10  58a4c295c6ac0d1c3410e01671ec6d391e98cace  99f76e8ed1584a7afbbdd0a8e117b4dbfc009fa9  feat(20-07): implement createAuthPublicRouter (login, claim-admin, csrf-token, user-count)
2026-06-10  61979759cab2ffae2942e2f81a7da438f59ad204  3e0a0c5e2569b58be7bc9c946c22cd063d7759b7  chore: merge executor worktree (worktree-agent-acc31e576fedf0c25)
2026-06-10  6331ca0f28cf06cda38b0408ef2298d5f149b621  08edc176a23068761ad23e78cfac11d58dea38c9  test(20-05): add failing AuthGate tests (AUTH-07 redirect-on-401)
2026-06-10  6b3c88ae92fabdfd786f69bdb845bda54279d701  2139cb3021045929191b3848ed7650a1be4f50d4  test(20-12): add failing CSRF recovery tests for AuthGate (RED)
2026-06-10  726e872c303d6e13bc9a573bf1793c077d1eec66  d94375d868770309025da20c477928cea6b4e627  test(20-08): add failing tests for createAuthProtectedRouter (GET /me, DELETE /logout)
2026-06-10  7de3132ddc757729b3e2ac922b569d0e4bc9e51e  1218c12f50545059808a71a4c79a2f2fde792185  feat(20-04): add user and session CRUD to db.js
2026-06-10  86a5b24c1f78a0b475f782bb3e208186cdce4f4d  0d8ec15cd6edda5d1063fb2b678b4d72c0d5d276  chore(20-01): install argon2, cookie-parser, csrf-sync in listener/
2026-06-10  888282c09549c88d17335ac899dedf9606e4962c  cbdee3588cbdfe4daeccceb1af12721b6ad9fcd1  docs(20-12): complete CSRF token recovery plan summary
2026-06-10  8bde89371a2ec91dfc94d7d7f6d2c318c0dc746f  c0ab758a6bb1c9d96859257d72b6aacabbba1cde  docs: set up v1.4 Multi-User Auth & Email milestone (research, requirements, roadmap Phases 20-23)
2026-06-10  900f979562bbf25064ccabd25c6fb5dbb9ab2b89  c1d21797873c034f379c59fbfa4ce50268a2768f  feat(20-03): add hashPassword (argon2id) and verifyPassword (with scrypt fallback) to security.js
2026-06-10  951d57a803da4c579eab5fa24116a11b37b9df97  e23f53f6a1308196e7aa8f3235c28bae9d822028  feat(20-10): add SetupAdminPage, first-run routing, and FirstRunSetup tests
2026-06-10  96e103729025ad30514ae0ccf28b38340cdebe40  400a775edb0a1a34a11da18d0e386e477e6be29d  feat(20-05): implement AuthGate, useAuth, and useUserCount (AUTH-07)
2026-06-10  9d1bf0c5d9cfc78036af78156b97612bca4edd84  c6e5d9c66eedf8d97111d659e44e4df29fe6aa96  feat(20-12): add CSRF token recovery to AuthGate (GREEN)
2026-06-10  a20ae8b429c6cc4d9bd7dba71eb318e5e42b5e34  a00b4ca425e296bc2feecfd843d42d5d94f2fd9a  feat(20-09): replace gate with async token-OR-session-OR-public gate (Task 2)
2026-06-10  affce17d1929580f38347d9effee7afefc0c2776  62d03a977b662ce394b1d729d7fb58c256f9d7a1  chore(20-02): install react-router-dom v7 in web/
2026-06-10  b19690b83bd6504a88628e55922410eabd88a0e7  5f1ee02e188c3f41afcf22de3aef9843b820bd0d  test(20-11): add failing gate tests for session-first ordering regression (Task 3 RED)
2026-06-10  b260c07f104e5c6bddf7317c5e3d4fc262e144dc  023fe86d970192c51dcf6f1d5442d8ed85b4e70b  feat(20-04): add migration 0003_users_sessions.sql
2026-06-10  b357382aabf510a4eb736f4288d3f9e8ed5bd658  1f98b30513101f636a61eaa58c59741da1ab246b  feat(20-09): complete CSRF wiring + SEC-02 integration test (Task 3)
2026-06-10  b9141d53c6555fb53561238a74ad956cc18a754d  49cc411971ba23b7413d6f9bfd2fcea8048f8c19  feat(20-08): add createCsrf factory coupling csrf-sync to custom sessions (Strategy B)
2026-06-10  bf84528ce6bc7e50b6046d33eb56ae70576c9151  3a922df683ce2f9a80678b99ab2582b0a555ed0c  feat(20-11): null-guard GET /me (401 not 500) + fix generateCsrfToken arity (Task 2)
2026-06-10  ca15c79de62cfa6124e77a625c223dcd821cc505  5563a6f39fbb2a42fe69bac53d9054e9a86b7c34  chore: merge executor worktree (worktree-agent-a5045fff08217ef09)
2026-06-10  ca833133f0df2d0ac49a6eaaa8a19e347adcbcdb  eec6d110acdbcda5608b81ad3c5468ed2af659f8  test(20-06): csrf-sync async-hook spike + strategy-B coupling decision
2026-06-10  e1508b56b618bcaaf972708968a296b4d5b25c79  e377f6bf7b2cf435ed1214a76e87b128208c3f71  test(20-04): add db-session.test.js for session CRUD coverage
2026-06-10  e814452715538f3b85d3db73cc3812a29faba615  55bf0af942e7248299686e5cae35671d2a078063  test(20-07): add failing integration tests for createAuthPublicRouter
2026-06-10  f67a62010dbc94b1f2607fef7865cf85f3ec17de  57f23e1c2c32daa43f4be5fc7d84bd1f45f39100  feat(20-11): update makeGate() + add CSRF/me regression tests (Task 3 GREEN)
2026-06-10  fd435edff9aba5961b03fb290975542273f34dac  f82d0ba01a14d041fb0e59ea2f11aae3ce3f61aa  feat(20-05): wire createBrowserRouter/RouterProvider shell in main.jsx (D-15)
2026-06-11  0a4eb5cebab6ee2f7ca44e23ea1921ebecbf643e  ad9a0c18801329a26c88a072ef03e0ce3801a5e3  docs(20-13): complete Sidebar Sign out control plan — AUTH-03 gap closure
2026-06-11  0b7d537e9f6a5937b47d962dbd3a89be5c528f6a  b59ebcf1f18b668ccb1787f2590629f608026c3d  test(21-09): add failing tests for ChangePasswordSection
2026-06-11  0c7582dc714ffc63a877e54238caee4559365ad2  cb28a49622096c7d2b09e506320ac991bbb90d63  test(21-03): add failing tests for invite + reset-token CRUD (RED)
2026-06-11  0dda7cbc0db7aae0c2fb1261de8af3153cb2b1fb  be0f112149d74be40658ad5602b368f1c7c7936b  fix(21-09): invalidate SMTP config query after save so test button enables
2026-06-11  13d7d30200f73913527a9332e020b55f987083e4  7a42777f2ac441dd92d1a32264ed3644e9c02be5  fix(20): WR-01 use real { user } envelope in AuthGate /auth/me fixtures
2026-06-11  1441c49627a035a45c896d156c0bb7595ad2ab28  43a702aaf95632b9c6d06389f2afa6f3097f4077  feat(21-05): implement change-password route
2026-06-11  1bdb77f556ae30732ed6715b3cde62440b1fe1a7  1cd3fe6b628fafcb518bed0d49ec0930e85d15b9  feat(21-04): implement emails.js SMTP transport module with non-fatal degradation
2026-06-11  210eac16c8f14c7a6c0dc6bce22da2fcf6fd44be  34bd2a0319fcf4b32fa5278f9142b1dfef08b6a3  chore: merge executor worktree (21-08)
2026-06-11  231ba44145a800b8b2f90a95ad812a4bec99604a  11be13878d7cab00b860f1b43aad30ba82e4d754  test(21-08): add failing tests for AcceptInvitePage
2026-06-11  234491810ac206236c8f80b8bca20800481bce0d  727778915067b3f1b2e70395879405dadafb7152  docs(20): mark Phase 20 complete — UAT 4/4 PASS, verified
2026-06-11  23c98830b2e89180580e7ef31cd182194f6e13f7  6006ae4e61463947ef8bcd93778647e0c71c3559  feat(260611-idc): add Report issue link to changelog/version popup
2026-06-11  2623835a07669209b9aae5311c7f5c663bc3733e  55ddcdba0c18b9740939f4139d0ec390db26a4d3  fix(20): WR-02/WR-05 make validateSession atomic and surface user email
2026-06-11  29a3024ed894198a9661e4116ca7de8f49b6062c  3eb313c7edf03c7bd90f12a996481ff361a0bb8b  chore: merge executor worktree (21-06)
2026-06-11  29a54ef414face21afc5185e69a022b380e37b3d  b906dbea7d77a30ee43b84dbdcbb55f87a820b5b  test(21-03): add failing tests for user-mgmt CRUD + validateSession disabled_at guard (RED)
2026-06-11  29c42392474f36f57da0f67dd1972c7b0082d62b  04a00ad6ff13da94fc8af1f73f96d6c28082fe37  test(21-10): regression test for useAuth /me unwrap (catches the user.role composition defect)
2026-06-11  2e5e7b66a419ae594a08c69292dc22e72fc3148e  ecad8c3065e73a4f69a204232d29d73db38ed697  chore: merge executor worktree (21-01)
2026-06-11  2f00e4d841134ddac6f54bd424435affb35cbab2  3a0721f52f409f62aa32f615671ff09748f344e9  chore(beta): enable Phase 20/21 auth on beta listener (AUTH_ENABLED + APP_BASE_URL + secure cookies + trust proxy)
2026-06-11  2fba95bb58966abafa84c2f3af942d32467ed9fd  cd02739e286a714c93c9a9fe2e3d7c9cf26b2b6a  docs(21-02): add plan execution SUMMARY — password strength primitives
2026-06-11  314c22520b9c3ff1b75210f86ff434f469d2da77  47106da05a6af01fb2008444a07490144848b290  test(21-04): add failing tests for smtp-router.js (EMAIL-02, EMAIL-04, D-01, D-03, T-21-04-ADMINONLY)
2026-06-11  32bd8d706587a8a8e3df8abeb2dff00e4820b748  79afdc7f753808c986a974842adca3cddc07cbf3  docs(21-09): complete plan 09 summary — settings section components
2026-06-11  34a0cb4457e15652c946d0d076f0f70bef8c9645  e2ea90caa3536fdcf37c93731f460fc8976fe9eb  fix(21): restore beta login + harden email senders
2026-06-11  384418cc4410ba66f5d873ec17899c528263b9f0  2bfc86cdded4776e553c10c0c09bbe2e265766e5  docs(20): update planning state to executing for Phase 20 auth-foundation
2026-06-11  3a5cbe48ad0c1b0e24e36df0eb43572b74ce8b87  306fb11415f9eb0aa03b7235f840d0298a4654d9  fix(20): WR-01 enforce 12-char minimum admin password length
2026-06-11  3f5b1fe5ce5ed5fd7afd372544176d8697b0d13b  6beb7004d2fd046c0c80e66c08d7d1ebe8e78558  feat(21-04): implement smtp-config.js — SMTP secret isolation + env-over-UI merge
2026-06-11  424dd9a88c603bf86694b95e2b161e317f370502  bf610562fa631a6c1275bb20cb50e085ee18d5cc  fix(21-08): AuthGate must unwrap /me — shared ['auth','me'] cache collision hid Admin
2026-06-11  446d5c6afcd3f43284e42a697e592409328aeaaa  9bd74a2b6fad9f6d1cc835a66fe525ae83e525ef  chore: merge executor worktree (worktree-agent-adc5e1ab7bf1de478)
2026-06-11  4a97ac3cf5e986abc58bcda62dc690e3493daa18  1599222628cf1d2bf52494452c61a820d8bade36  docs(phase-21): update tracking after wave 3
2026-06-11  4b5b907c383b0e15c6de671e079ec34362c849b3  e35350be8fbe8de391759a9b453877e59998f5cc  feat(21-09): ChangePasswordSection change-own-password form
2026-06-11  4da7fa51b663b9c38ca2eddaccc21d09df203e46  2a625f399124dc9bb6026a7f3b2dc59f51ee1ba3  feat(21-08): implement PasswordStrengthMeter component
2026-06-11  4e55e10487344fcce2352474bead1567c957d798  085e07dafbf0c44c6ee98754d782b2d13a08111f  fix(20): WR-04 force CSRF token regeneration on retry; tighten rejection match (IN-02) and thread fresh token (IN-04)
2026-06-11  5022329e002b5b5b880eb0016c044ec2a64268e4  2c481833cb72833be530a4910ed5483328fe1f54  docs(21-07): complete index.js wiring + nginx log redaction plan
2026-06-11  520f5c88a2e11473eafbee137a5365250527b8bc  5d2b494655d5af58eaef263a65ac517f65f0315d  feat(21-03): add invite + reset-token CRUD to db.js (GREEN)
2026-06-11  5392981651189528a50d52b8f03fd65f0970a6b7  4188a9a27b1f3b9cc0ba3b588872b08f772a7617  test(21-06): add failing tests for users-router (RED)
2026-06-11  55401a7cc370e430e58d7d5a556b07872019e740  9e276a9fd0c72e4781e98de4b9af4e3996cbf30e  test(21-01): add Wave 0 test stub files for email, users-router, and db-invites
2026-06-11  560e142dae498e4d9549f9db83f3fbfb04159a35  f2983c8631890960801593065a61dae268b72880  feat(21-08): AcceptInvitePage + /accept-invite public route
2026-06-11  5c5c3de3a1a087be42491bb1f4c1993e87142e99  27a0a19133b517ddc7d97e1d9b7fb159949ea277  feat(21-09): useUsers data hooks
2026-06-11  62afc49bdd27154dadecf5e905d066c9b3a76e1f  30b9dd31f81b46bfa969a8a759d75807723e44cb  feat(21-02): add passwordStrengthTier + strengthFeedback to web/src/lib/strength.js
2026-06-11  62f85aa3e523b25ce68bd97fa5d28f4f13947ebb  68c22923eca4c1c03a0eef946a80f4acbc146be7  test(21-02): add failing tests for validatePasswordStrength (TDD RED)
2026-06-11  69a285d7ab6fbb885bb56268b93805c5592a0aaa  4938eb844d9a352b8c9c7a5d32d96264acfd2fdc  docs(phase-21): update tracking after wave 2
2026-06-11  6e5d2d35ecd93fdd92542f22d942cf601ac8ba09  3ecca4fa8437172c0b03a2ce4d38c9c12e74a5dd  feat(21-07): wire email + SMTP + users-router into index.js
2026-06-11  70c9505e49fcee5629bcd87df5f02a7cd9f48602  160fd78e66232d953b9838789a7b5749964c4daa  feat(21-10): restructure SettingsPage into Admin/Configuration/Account shell
2026-06-11  70ca04a3bb64243d1294fe1d12af3db21bb342a3  726c09ca7943df2bbfefb15d9ab72699fe9aca6b  chore: merge executor worktree (21-03)
2026-06-11  73c03cf4cbbdacfcfb0ba8096f2f63760764dd62  2ef5536b945017cd29e3a4de40ec0d9294254690  feat(21-03): user-mgmt CRUD + validateSession disabled_at guard (GREEN)
2026-06-11  79654dabdf115663fae5363f1a13d6b9edf3703b  c4aee1d8409fd6eacf31aeedf8f6de0d3ed8aaaa  docs(21-03): complete db.js CRUD extension plan — invite/reset-token/user-mgmt CRUD + validateSession disabled_at guard
2026-06-11  7c411310adb67c630e984e50afc03b878dd2c78d  112e8c1a3f46d0b8af4d2cfc752de4f5d84e146c  feat(20-13): add Sign out control + user/account section to Sidebar footer
2026-06-11  7ea39627bfea532c6317f6ae2c9cda68b154d880  8209d7e302825356a347f4a5ed1a1a261bf79ff8  docs(21-06): complete users-router plan — users/invites CRUD + last-admin guards
2026-06-11  7f11703213eab2aec16bcca9bfd50e5b921f9130  9a28c425b242297322eb47adec35eac58285e877  refactor(260611-idc): reorder sidebar footer and remove Report issue anchor
2026-06-11  882e5c1a05d1a8436c0fb295291c33d11f95babf  3535b16aa59ad280f00d2c0055d0d4353de01f5c  fix(20): WR-03 sweep expired sessions alongside retention sweeps
2026-06-11  8a45835095dfd862183635ccebda01148fd35002  dcc140cd1537939aa3d5a909f94cf21dced758d1  fix(20): WR-04 validate ARGON2 cost env vars with parseIntInRange
2026-06-11  8f11f10327a93a9fa6d7e9cc3474b1956bbf5e6c  3a2b7c76886eeaacac9062c763cdb825d8800850  chore(21-01): install nodemailer + document Phase 21 SMTP env vars
2026-06-11  935c0c6ca1ebe55de224bd27e5a0c0b0c83c32b0  7cfba2a11b9dd37a80acf54ba1f9a7ae9d7e5267  test(21-08): add failing tests for PasswordStrengthMeter component
2026-06-11  951fefdee0fc9d07a6960609a6d3ba4cf37a0f09  9d73d213fd18a3c8dc5abac46c6735ff2da614d5  ci: gate deploy-beta on DOCKHAND_TOKEN + allow_failure so it never blocks main pipeline
2026-06-11  964766de1be8e842b1404cf3dd86d89ad209d962  01e83935d7e3b6f25267872fd8ae13a8a692bb31  test(20): WR-01 use 12-char passwords + add too-short rejection test
2026-06-11  98963362ae4b176d021a423217e5b0d326a2e752  03887bd1eaed2d6ba2d88364b6220d7024961cf7  chore: merge executor worktree (21-09)
2026-06-11  98ae7ef10412bc671dd66ff55b693bca9725aa76  580686b8790de68b0719801fd54999661cb4bf0e  feat(21-07): add nginx combined_no_query log format + /api/auth/ block
2026-06-11  9c3bdb87514f805717d19831f9ba0fdf8ae8bb53  b4412c0d01616046597b695874ad02f4a543ecf0  feat(21-06): implement createUsersRouter — users/invites CRUD + last-admin guards (GREEN)
2026-06-11  9cd278e8d514b5f20cb73639149200a6cc036707  974514369c596eacec23dade9edadbc5376d22cd  test(21-04): add failing tests for emails.js transport module (EMAIL-01, EMAIL-03, EMAIL-04)
2026-06-11  9fb232e5be1c2e68a079f8dabdd88856987aedd7  60584ff92382bdc327d223020d0fdd8f73881e12  fix(20): CR-01 close login user-enumeration timing oracle
2026-06-11  a1cd0575b0b079c6e4253abfd689625f41492c9c  e24e70be155383a36313ebd8d9b215e2f14c83ca  fix(21-10): unwrap /auth/me in useAuth so user.role resolves — Admin tab + role gating
2026-06-11  a1fe6ab2090764c9ca9514d598f70c16fafbc666  b12cc522dcbfa7782a52385ba30070452ebcf064  feat(21-01): add migration 0004 — invites + password_reset_tokens + users.disabled_at
2026-06-11  a6f11e9264abfedd55eef054669ae027af2e7167  bd3a9a33e6a40f319a7f4ac2fdecdfca07cf9536  feat(21-10): add InviteCreateModal with role selector and copyable-link success
2026-06-11  a8626da7618ef492ec1363dbff3d61dcf63ac563  7103ea649e0a5b26542195b62c44a850ecf8b9e8  feat(21-02): add validatePasswordStrength + COMMON_PASSWORDS to security.js
2026-06-11  a8d38bf5035a671cbeaa695d585b12b8f91d8490  e2cf95c56ce4f1b67d27c25554194557fe29e28f  chore: merge executor worktree (21-02)
2026-06-11  aa1488c2fa97d0c6bf32330c17c6ff9db631607a  3c7c3b290007d6cb687b01e0a7fd859d2c9ba2b2  docs(phase-21): update tracking after wave 0
2026-06-11  abce8c728e843652261cd76e66774df57e9c5840  f91bfcb8f85585e25ea8021e52cdc8552332214f  fix(20): WR-03 surface dummy password hash precompute failure at startup
2026-06-11  ac889e1049d77f0f86559e71f023d2a7a9448dd0  df11a0e33727a15c9223d71a738cc045a4166513  feat(21-10): add UsersPanel with user table, pending invites, guards
2026-06-11  aebc9e961e704c190d9f206d29c8e834f616d61b  1439711cad09f3bd9752dfe4377f55071048d910  fix(20): env-gated trust proxy so auth limiter keys per client (T-20-BRUTE/CR-01)
2026-06-11  aeeb58dea6136c4f9818f9d808c8e3bbe56beebb  a5611aaa5df7b769e805cde2720fffc10e8c276c  docs(21-01): complete Wave 0 foundation plan — SUMMARY + 3 tasks committed
2026-06-11  b0c3dba4fc0a8fe5f49eab80f75e0f27630e8b8b  6122d4edd0f0d74d657e4697b85b4aaa63378ae2  feat(21-05): implement accept-invite, forgot-password, reset-confirm
2026-06-11  b2260e694d3766558c52756631ac63d941e3eaf8  cf19c60195cba51f20b8cbdb62b56e51a8ab831f  fix(20): WR-06 retry once with a fresh CSRF token on EBADCSRFTOKEN 403
2026-06-11  b63989b2d005d7fb6434931ab165f7cc5bd58ec3  fc0ac5d0c06d7a68635065a55e443684a9054cfe  feat(21-09): SMTPConfigSection SMTP configuration form
2026-06-11  ba689cb74d4dc02bcd313fadeab6b79c90e052ed  7753207dcf558b8a5e323924c3c342d73afba2da  test(21-05): add failing tests for public invite+reset routes and change-password
2026-06-11  bae5cd330b88a25d2b2e2e2bc8ee197e249bdee0  3e78b31a6723a6f00e9eb5a892f06268891f8598  chore: merge executor worktree (21-05)
2026-06-11  bd691e86ffd1aed141e35b696b2ad6449a8d44b5  03f93f3819e2def7f9cb6e00d51211a78b57524c  test(21-02): add failing tests for passwordStrengthTier + strengthFeedback (TDD RED)
2026-06-11  bfcaf918aae17ccade839c29358d938fbe9d4fdb  12c27ce13d0b79ad2d382a52462de79fbf615bbc  docs(phase-21): update tracking after wave 4
2026-06-11  c7862cd771abf7cd673750cecbaa478240456b07  3e4ac724848b2b10ad8dbed9d4055895c2b0bbf8  chore: gitignore generated graphify-out and playwright-mcp artifacts
2026-06-11  d03faf9bd8ea4dd5e0833986cb19f7fb5ccfed98  3930a334c08dd640611e0f57930101ae7a6e3b4b  feat(21-04): implement smtp-router.js — admin-only GET/PUT /smtp + POST /smtp/test
2026-06-11  d53759d0897953ab4a70d3d5070a3641e29cbbe2  7f4873971d807dc4967a573dc61f4177fc9b6561  feat(21-08): implement functional ResetPasswordPage (two views)
2026-06-11  d6641f13b5a20e71be5836628afcf6363990e463  15932ba03f38be38b6456b3c2f1f58700a30db29  docs(21-08): complete public password pages plan — PasswordStrengthMeter + AcceptInvitePage + ResetPasswordPage
2026-06-11  d79284c2c714b360bb8b42d4f3c1b07090d7073b  729d841b6388c2c006e5086891732c4f33c12d43  chore: merge executor worktree (21-07)
2026-06-11  dd3d10765dfab66c1170799348185ab8ceec6a53  caf00118eea5343fccbe69d9aacc97c4b47ff1b6  test(20-13): extend Sidebar.test.jsx with Sign out control tests (AUTH-03)
2026-06-11  dd3f572fce5fc11719d81adc2a30a9a9d37e9cd5  d3a11a387156fe1be1415a6c9aa8789ebefdda8f  test(21-08): add failing tests for functional ResetPasswordPage
2026-06-11  dd6fccee25e92c56a11aaeb346bf38b51bf3be10  ff89672cbc3d804f1797d8d3c05ac85f2413f588  test(21-09): add failing tests for SMTPConfigSection
2026-06-11  dd7fb9db9d0215ff5e7aea89ca2f18343195fedc  9e07a53b1be7b05ad7b18fbb10c1c6b30d457b2e  refactor(sidebar): account card + inline version chip in expanded footer
2026-06-11  e068d4f930225e593cac6bb34af19d956055628a  f833608a4499a2a6e76908729305fe8cabcb622b  fix(20): close claim-admin bootstrap race (T-20-BOOTSTRAP-RACE/CR-03)
2026-06-11  e927ad6698d35f345053da82b68f137d134e0f2a  2e7be444179f36927b2a8106a54f7758cb385b4e  chore: merge executor worktree (21-04)
2026-06-11  f1a6f36d30fdbe316792fc18c96c7a7adf256626  b10037854b92c6d6fe457c997624fb521b544857  docs(phase-21): update tracking after wave 1
2026-06-11  f4bdf457d5749e0aa2e511b661d1302b6c098e87  c99842e8c7162db55a3f01b09c8567a59639b224  docs(21-04): complete email subsystem plan — emails.js + smtp-config.js + smtp-router.js
2026-06-12  0314dfaf38b95eb76866e194519dfde222cec395  dba62cbed8e23c4e8879872f39a2fbe895c69620  docs(22): correct ALERT-03 (done in 22-02) / ALERT-04 (UI, pending 22-04) status
2026-06-12  035b9b27b78bad70e51d0fe09b2581915039d3fc  754e479b51e927a5e35a436049734905b8b88f5a  fix(beta): db-sync reaches prod via docker network, not host loopback
2026-06-12  08f38125428adda1f929cb4817a52acb78530cb4  079d8e045a6a11104fa9b23fcb99d7a3718d4b97  feat(22-01): add migration 0005 for email alert channel schema
2026-06-12  1cf88217a8dc4352db481fd8b0eccdfd61c95f98  d1bfafaf4ef2a0a0c1b14691363da7291b30e8df  docs(phase-21): complete phase — VERIFICATION passed, tracking updated
2026-06-12  2b53493b087122659bde2b6aa4cd498b09b4832b  4421fb2b3e562e4533f5c98203753a815259b57f  docs(22-02): complete plan — email send branch + startup wiring
2026-06-12  3fcd77e592b1675e81ed2f1a0a372550518b3245  72b12eaecef20ad2dbd4f81840ff6e9d66a97edd  test(22-01): add source-inspection test for migration 0005
2026-06-12  473b55dc7c4675e63dafd03c8aef45cd14a97c79  217c73f1c45d2df3050050ea686663cecdf67c1a  feat(22-03): add channel+email validation and toApiRule/INSERT/GET wiring to alerts-router
2026-06-12  49e4a2bfde2c063b1f0712d1713438c4d24a726c  16420a0f5531aa07ba541c0786a96b04f7d72134  docs(21-10): SUMMARY + tracking — Settings/Users/Invites + 6 human-verify fixes
2026-06-12  5bd7745689923a7294ba30bdc23e033542a37ded  09c63fbcf1f9c826039602ebe06d807013a7cc9a  feat(22-04): channel picker, conditional email field, prefill, SMTP hint, badge, delivery recipient in Alerts.jsx
2026-06-12  5cda9c7c274784e5b1db4dda428b6611f16c14a0  1adc03f51318674419c185ef50b3924db7f90d1c  fix(21-06): last-admin guard must only apply to admin targets
2026-06-12  5fdc88fe77a2493234e754ee1d8baf34bf105c6a  af0a741617f9c3e0aeba37f022ab13f2f641f163  docs(phase-22): complete phase execution
2026-06-12  64a2efb2060c5827e3cbd5189f4b667aa03417e3  6c3d0c199133c10a4f143f3431b27729f8191049  docs(21): add missing 21-05 SUMMARY (reconstructed) + 21-10 SUMMARY (force-add; .planning gitignored)
2026-06-12  66c29e03dd20a0cc3997f33d182ae130c91d59a4  869da8b7331f4755a6c9107b585ec31f414191ce  docs(22-01): complete plan — migration 0005 + Wave 0 RED scaffolds
2026-06-12  735deae314bdbb0de5fd5c26b4835d57799ea277  462892284a5cfca7528fc8bc35053734a0e31dd2  test(22-01): add Wave 0 RED scaffolds for email alert channel
2026-06-12  76f097e9b11f83bdcfd16ace179b6cdf121c6e4e  46d5968890d7aab90a6bd290a5a67998093aba97  feat(22-02): thread SMTP from-address into email alert send branch
2026-06-12  7a7f358800d07f819e6b00c2780181c92f99d4cf  658aaf124e8d8d51ca8496cc4aa9799889f359c6  feat(22-05): add explicit Edit button to Active Rules rows
2026-06-12  86a18b3d9732a37c9d391bcfc4653f8a5521b195  0d72d8fca3f47242620689adc84b7fd38e61579f  fix(beta): db-sync exclude only auth tables; preserve pgmigrations via re-stamp
2026-06-12  8db23e68312f6a25cce01a79dedc7f9a7a9ce6be  5ead1f096c7f846b4079446a4a2c569ba7327257  docs(22-03): complete email alert channel router plan — SUMMARY + state updates
2026-06-12  99e624287340b45982fec27c0f69445c7d77d6b5  36e2f622b9be1c695329d25f5076d6da267cee9f  test(22-05): regression tests for explicit Edit affordance
2026-06-12  b2d964292bcdc227fa8f397c0798b7a3b958428c  54d8c699a9afe7d56e7d9563f4b218abb602a5ad  fix(beta): db-sync reaches prod on shared my-network + excludes auth tables
2026-06-12  c89a06e75f400903e228b7a1c117e48032b03cd9  0231de349c5518e673ce01a2caeadb724a9f93e3  test(22-04): extend Alerts.test.jsx with channel picker component tests
2026-06-12  d9289aa947040522438e13e3c5e6e968f3307993  82bc9290fc52d7d227a9f7ba1fe9c84f11cfd13c  feat(22-02): add email send branch to alert processor
2026-06-12  dc67b7202929db44e26e690cc3d8ba411ccdce88  195ab674683b10163e701a8fc4bbb25d9b675fff  docs(22-05): record UAT gap-closure completion in roadmap/state + summary
2026-06-12  ed4aa61ed6c23138772ed2728d949b326af8c6eb  2d40c7beb587c7c1c8e390c85b65e2b39c36209e  fix(21-09): save SMTP password on first-time setup
2026-06-12  ef0863d3fb9018b5bee7a7a773a3fa5c15090160  7de6746aff95845cd39017aebf7b1e96d7a129de  fix(22): map alert-rule channel-field CHECK violation to 400 (CR-01)
2026-06-13  00e04d22719b7be1f38fcdcdaaaa1166a06c7fb1  e0891477d93d82b3b1cb27c68da3edd66eb93023  fix(260613-e16): re-thread SMTP from via onSmtpConfigChange callback (HIGH-1)
2026-06-13  016a96a235843ddb14620b05517a761f7b690c37  a66b5b5ebf92251246df00daee48ea7d4f81fb8d  feat(24-02): mount me-router at /api/me in index.js
2026-06-13  0333181e43f016167bd17345cb6a37b38121df8a  50ecb5bf7a906c883de475f0c61538197a497940  docs(24-04): complete dashboard consumer refactor plan summary
2026-06-13  03a1464b45c4b18cab9983de7711da3104362803  65004d6b2d62797567ebdbbe73ee93d0d1af1e5e  feat(260613-q4z): add optional headingLevel prop to Card.Header
2026-06-13  06227ab37a3a7a5b571b69d7b6c3d7569a8c22fe  1dbac69fbc5fbcab37c044d10e162f0f63ed8266  chore: merge executor worktree (24-05)
2026-06-13  0e76f6b83f6c5b2c4f7bb3da167626069bec38c1  1d59bd040690830baba41683e89aac867eb64d73  feat(24-01): add migration 0007 user_preferences + source-inspection test
2026-06-13  0f47531138715946e7f4c36d5a847d9b09ecf1eb  196e960d77f9e47de6d971ad5af1cb0760cc8d21  test(23-01): RED session-metadata stubs + SEC-07 auth-gate no-bypass guard
2026-06-13  0fce50fe28f8554780bb6aac3650f5cd7355941c  ce72c256de4a26ac499b0678d1632cef60982689  feat(23-05): useSessions + useRevokeSession TanStack Query hooks (SEC-05)
2026-06-13  1395f36aac3441623e1838e4d60d6f301f21d231  e6e88c473966280aa569a30558724d231ad22854  docs(24-01): update SUMMARY with assertion correction deviation
2026-06-13  15063a08f2957aff27b6cb92c31f57b14e671651  0b83df2d57cc7a7d6110f5486f0b562ec005db29  docs(24-02): complete me-router implementation plan summary
2026-06-13  1b2419acd1699853e3542ee83bb83c61250ea29d  78f2cf5e3f1c60fa5b101745b5f9ccc36e1b88b2  docs(23-03): SUMMARY + tracking — nginx cutover complete (render test 0/3, checkpoint approved)
2026-06-13  1cd696d992c1901a25959a30206918de51c29115  19b2c0b2d3c22adeca2aeb8dc694370c6f5e9834  feat(23-04): runInviteTokenSweep + runPasswordResetTokenSweep delete-only functions + RED→GREEN test (SEC-06)
2026-06-13  22559111e2dbb47ffc6104d178d5409f308a6ac5  dfaa3fe894c23f7eb09c600885298458d3b21c56  docs(24-01): add plan execution summary
2026-06-13  238b7bdfc054f9f11f437e214df4755af5c64204  842c6a10f6652269a24508e649126fdcabcd5757  feat(23-02): self-scoped GET/DELETE auth sessions routes + issueSession UA/IP threading + CSRF test
2026-06-13  26c2ae72aa4179c12b4d55b328a065d1b7fa4a6b  88e947d2392b94d1882f9255819420b04a07ecd6  docs(roadmap): add Phase 24 (per-user UI prefs) + Phase 25 (per-user quiet hours)
2026-06-13  2fb38dcf6f4e727bd7e7f8c10c1dd62113e30e4b  17c0d01309c91e74ec496ccd88080ed57e6175a7  feat(24-03): implement useUserPreferences + usePreference hooks (GREEN)
2026-06-13  3e903f27eb5b2f682058a63adc14b48bd05dd0ca  5650f5cb9675f36cdac2a5747f3f435a0f7115c5  fix(23): surface bulk-revoke failures instead of swallowing them (WR-03)
2026-06-13  421c73a1c81f72913c9e7b3b30cdfc3a3b7fe37a  e48bfdb729e0765726f0610bae3375ae926240f4  chore: merge executor worktree (24-04)
2026-06-13  4768e52d5fa4c6ac510389088049bbb29d8e7df6  29d178bbbb04e89b871bbf84f33ffb545c79b4d2  test(23): persist HUMAN-UAT live checks + self-verification VERIFICATION.md
2026-06-13  55789a0f29724b76c29f747c63999fef3f3cf16f  0bfa419abf5f3749ae462ef3dc867724f5bb09e2  fix(260613-mas): normalize standalone entrypoint to LF + enforce via .gitattributes (PE-01)
2026-06-13  5736fb6b0d24a4caed84584397b3eefd56aa7afd  0e4975c50e11d55cdd0c1917495650e45292517e  chore: merge executor worktree (24-06)
2026-06-13  58e4d8191f60c81267e51ae06e12f5f0161116ab  4e302c1a18e05fc965d5604715e16b9b1fc203ec  fix(24-07): serialize preference PUTs across debounce windows + harden lifecycle
2026-06-13  5c559344b5f2e666c46c152678712d395ae505fc  eb3165b4fe6a92d41d90eb3f805c3b0a6cdfe6ec  docs(24-03): complete useUserPreferences + usePreference plan summary
2026-06-13  631bc7624093c12abaaa0a60142dfa3e871a2dfb  9f1e8b6391c4e7c98d675b7e0c69158d10f1c822  chore: merge executor worktree (24-03)
2026-06-13  68959b5da9053054bb0d833d2d564300bcc8830f  632d18c86f572b9a63e17285956c73900bdbe7bd  docs(quick-260613-q4z): unify Settings section headers to titled-card style
2026-06-13  6bd14df521adcb85518db518d14932b61f20932c  9e5023a1b5c15571c608ac0f217585b65f9950c4  fix(23): source NGINX_API_TOKEN via .envsh so it reaches envsubst (CR-01)
2026-06-13  6ce6d62eb290c35053b9e0e9e1163be97ce43553  e7f22bb6f492f22456defe1f4159c76a709acf09  fix(23): fail-fast on unset vars in standalone entrypoint (WR-01)
2026-06-13  73936eddfdea25ec72e8d46d4ba418ada0675f79  46adb42798040f7a3382cb6128677d50db7d3a30  test(24-01): add RED web hook stubs for usePreference and useUserPreferences
2026-06-13  747a079a1d9af455891d738bd742b0097d539bb6  8fe7f2ef64c163ced7e540964c58f69ae4f6a4c8  refactor(24-05): route useMutedDevices through usePreference
2026-06-13  787acbd42229f9f0dd66089c174378eeff60e428  80f29a84665dfc6a5e524b56979351a1ff543694  docs(23-04): SUMMARY + tracking — token sweep complete (listener 607/607)
2026-06-13  7baf3fbd82bfbb6f286747b5676510f31d5fca57  ff199830577fe0e83533f58f1356863943056151  docs: Phase 23 code-review fixes + PE-01 planning artifacts
2026-06-13  810b8a48c40fd9aaa67b92713537dc40b2b8bbad  8bea8276f0a3d19aaac270a6a2f138e66500caca  chore: merge executor worktree (24-02)
2026-06-13  83e3312ec769f5297bbcd2974157d58301f7a43d  f9ffeb270ea856605a1aa82f7f6631dad987c312  feat(260613-q4z): convert SettingsTab and AdminAdvancedSection to titled cards
2026-06-13  83fde3984de53ad4c23232b461dca1a0b533bb99  7f4f3043757b7fb7667c139bb719afb313bce584  feat(23-04): fold invite + reset-token sweeps into runRetentionSweepSafe (no new timer)
2026-06-13  913b2d1cf8686396aba56ef6eab2cb363185ea8d  a4312b039ed2dddac550a04fe0883fea3d702792  refactor(quick-260613-nwt): convert SettingsTab to 4-tab Configuration; strip Advanced/Danger Zone
2026-06-13  93e235646b75881e58fb468b578ca39ad2f5b361  3c0b6fafc25758a3d05e10c967da34ffe2fdd4e2  docs(phase-24): mark 24-02, 24-03 complete after wave 2
2026-06-13  94cf66dd9e86b2793f567c1362f338af85d50019  c8d9ccb8098d60051285e5b250e3aa1da26530bc  chore: merge executor worktree (24-01)
2026-06-13  962297806f228eeee46888fc93711d95c9ba38c1  1ea6b9a1c0fa5f1f5e483243581ddb4ec51edf69  docs(23-02): SUMMARY + tracking — sessions API complete (listener 603/603)
2026-06-13  96854b9adfe2e85f6e8a697e2eda9d5171685e59  7e0dab397660b17b20c09566c9d50e7af74ad152  feat(23-03): nginx X-API-Token cutover — NGINX_API_TOKEN template + compute hook + Dockerfile (SEC-07)
2026-06-13  9b659718602a39f37fdef83b4cb7a37ea395a7de  021de7af5c789ceca9b878900b6da8c0ce31c761  docs(260613): commit Phase 24 planning baseline (PREF-01..11, 6 plans)
2026-06-13  9cb9a659986f0eb927687c38c0318957155c64f7  1521fb63fb0396a882c0ee46e4e8e91861bdbfff  feat(23-03): standalone entrypoint NGINX_API_TOKEN compute + AUTH_ENABLED on all web services (SEC-07)
2026-06-13  a1f6d4fe16e5bd275768dd95b1013985d3f7e582  ab62af0814e10070cc949d5f19dae82113af13b2  docs(25): capture phase 25 context (per-user quiet hours)
2026-06-13  a2224e128fe800973767ce0e242c242f8c84449e  ff1e6ab43699d738ac272cf992efdf793dff6fe4  docs(23-05): SUMMARY + tracking — Active Sessions UI complete (web 290/290)
2026-06-13  a84a2afba58f9595b14fdc164f0d57593ca88804  c8cf40b45ccdf431551f6765af899312130b5d96  feat(260613-q4z): convert UsersPanel, SMTP, ChangePassword, ActiveSessions to titled cards
2026-06-13  ac12a3cb8fdad336b530d1caad22bdc12b4d708e  7d6b6824475cf196921fb7c770fbbf46f0afc2fa  feat(24-04): route DashboardPage global range + sync toggle through usePreference
2026-06-13  ac28b842c8e08eb52cb422e65db2427c72739939  11edb1e6f0e9ec758361853d71491ce41603570c  feat(23-02): listSessionsForUser + revokeSessionById + createSession UA/IP columns (UA truncation)
2026-06-13  ac400e236120b0bbc75b77a56b0763bbfc94c236  b200a367b31787eddd16bb502cb9b242ef27a413  docs(24-05): complete per-panel ranges + useMutedDevices preference refactor
2026-06-13  af2cf472e40891ef32fef9814850e55717ba7fbe  a29a745fcf158c501c5a1ff11a80bec6562a73ec  feat(24-per-user-ui-prefs-phase-1-24-06): route toast+grouping through usePreference blob
2026-06-13  b28456a49ccf823654c5d46111542ae2fa9a3061  482f739e3221fb61a1903b690ff7ddb311c3cd89  feat(24-02): implement GET/PUT /preferences handlers in me-router
2026-06-13  b3cf2141ef1fe788f4a4ebe435dd008ceab19cbd  84a8fccc930a93bc5f07d5a934e6851cfba92413  feat(24-04): route useDashboardLayout layouts+hidden through usePreference
2026-06-13  ba308a8f96140074d2e00b26cf95ee8d77d04de6  e6f25bdc5521649c866757a0406552dc20cb90a0  feat(23-05): mount ActiveSessionsPanel in Settings Account section
2026-06-13  bafe0e7098e05159aa49ba3ab10fbf1d94f493b9  df41312b46f1486dc9dcec0cbc9fc8fe0c1e5ad2  test(24-01): add me-router skeleton + RED integration stubs
2026-06-13  bb0c753a1b2c2ef4fb80d3687bf87ce4baef2312  08c6bbd2903b3bad240a6d88dc49d5e7d78b23a0  docs(23-01): SUMMARY + tracking — Wave 0 complete (RED scaffolds + migration 0006)
2026-06-13  bf4f18fef52473e2106aeb7589c25b66c450792a  a05db16d99f54b8368a91afdec0aaf9c70d1c0d5  docs(phase-24): mark 24-01 complete after wave 1
2026-06-13  c2b4ee6b8543615f1ba7666454677a5baae59e98  8ae3d9fa602bb9bc418df71e49394f06ba2a9d5e  test(23): boundary-faithful nginx entrypoint-chain regression test (WR-02)
2026-06-13  c57b000826f58f80dc169d2eb650b78f14903434  73acea35b102c7100a1a5b32f7833964c0099f39  refactor(24-05): route four per-panel *_days ranges through usePreference
2026-06-13  d75f52cb29fb34809eeb7dada91e505290b83b7d  f5626e10113a12aeacd8ee71929a7d4a7a0c8c21  docs(24-per-user-ui-prefs-phase-1-24-06): complete plan 24-06 summary
2026-06-13  d858d39f60c15216052cbfa77ae2a34ff671962a  a343da506949f1ec9b3b4f7ea41f95001da1c17c  fix(web): wrap Email (SMTP) form in panel card to match Admin section theming
2026-06-13  e1dd3101b876b29ea4c684ca20d9a8c25318ab94  cb5ca80723fccee2a53dd82c5b8fcaed473713db  docs(quick-260613-nwt): restructure Settings UI — tabbed Configuration + Advanced/Danger Zone admin-only
2026-06-13  e4554ff81b37104166db22adb6924a7f0184a09d  05f70b21e3d61fe388e62aabc2ecabd88b10f725  docs(25): create phase plan (per-user quiet hours — listener + web)
2026-06-13  e7663b410df1eba1dbededa33d14621d2bd81fb7  c55120115a35fb9a76db360f23ec8e8303015f24  test(24-07): cross-instance debounce regression + relocate seeding to provider
2026-06-13  e846bd578e66124bc456c469e4b84ee67051cbcf  6295e5e19fed3fdc28176bddd79d77ecd5cd86cd  docs: per-user UI preferences design spec (Phase 1 + Phase 2 outline)
2026-06-13  e8f51e1697f8f7040ae18cd6829955598dc498dd  e4521bf12bb615ea5417c0b2f1dfd98a1621cb13  feat(24-06): route theme/accent/sidebar-collapsed through usePreference (identity codecs)
2026-06-13  ec7a15e8c8e4eb47e3f3fc8c01f05c513979e848  090cf44534d73ed2fdf5f14b2986b04b656b7bfa  docs(phase-24): mark 24-04, 24-05, 24-06 complete after wave 3
2026-06-13  ecd99abf81253135915f8014d91f3bd23458bd0f  7e41d0343b8bdf67b8786969121355886296ae0a  docs(phase-24): begin phase 24 (per-user UI preferences)
2026-06-13  ed6edba8517fdab873b2c949dd1d31d46a50420e  eb38df82428fb62e9c30f4b344bfedc7b123e4c9  fix(24-01): correct RED web hook test assertions
2026-06-13  edf17a6ac793110cbe507e9e9c133ece2e046515  e493bd2714fe016ddc72cc1c17a01d2e521154cb  test(23-01): RED nginx render scaffold asserting X-API-Token value count (0 auth-on / 3 auth-off)
2026-06-13  f121b66ab08a1fb45ae20cce2c8277e94ebd32e7  1d7b1821dee017a4dbe62b38ce5f7eea88f7831d  feat(settings): order Device Management first and About last in Settings tabs
2026-06-13  f1cc014bdee484de2ee69aaa735f112791109d09  e4fb4e2410506549ce643645e7af1e31d061816b  docs(phase-24): mark phase complete — VERIFICATION passed, PREF-01..11 done
2026-06-13  f35654cdb430ccba7a5c4579731dac037254631a  fe5fdc348c136ccb238a2b45279cd7a622713d22  feat(23-05): ActiveSessionsPanel — per-row + bulk revoke, This device marker, scoped pending (SEC-05)
2026-06-13  f5276b3e1582435c3676cdfc840a6e057f5315fb  7ada9f1e1953613a00396d293c833c333d895885  docs(phase-24): add 24-07 gap-closure summary (CR-01/WR-01 fix + second-review pass)
2026-06-13  f5b9f3a2b3cd11fc857fdd4999d5b8de5890cc18  a99da573e9fc6b8709745288055c5ee13e924581  feat(23-01): add migration 0006 session metadata columns (user_agent, ip_address)
2026-06-13  fb8d83511dcb8987445582f872338d41aa8708e1  709db7598d16a4e6a5e5d34662c08c60c08c4d1b  feat(quick-260613-nwt): add admin-only AdminAdvancedSection (log level + Danger Zone)
2026-06-13  fc229389896e173a893ad5efde23f3e27756d513  d2252a8875912d79641795e381748ad6db4f90f4  fix(24-07): lift useUserPreferences to a shared provider (CR-01) + sidebar codec (WR-01) + drop dead skin blob key (IN-02)
2026-06-13  fc4d75ef39c78669111a7683d9f4b62c06e4ccdd  8b4f244ef22cdf5ed7d595d0177b6f3877a1a039  feat(quick-260613-nwt): default Settings to Configuration; render AdminAdvancedSection admin-only
2026-06-14  029c3212a05ca2f5ddb73b6c687617ea492485df  2f88f5e202dc78641b38aee887bdb291d0c4790a  test(25-01): add failing tests for session-aware quiet-hours resolution
2026-06-14  043e003597a3916800efc59d46058552fb97a546  699c5782fe91598811b0bdc7d95957448875135d  fix(auth-router): pass secure flag to clearCookie on logout (M-6)
2026-06-14  0992ddbbfd4764b5df6a8e637187ef29fd8c24ca  69d56f1f4601882642f1d0d15eb274ee35d9be02  docs(25-02): complete quiet-hours UI wiring plan — SUMMARY, ROADMAP, REQUIREMENTS
2026-06-14  0de2cff5b220d9aaf5feab5a8bb3d8952d54eee3  6bd7eabf0454124e76ed18ca36ae530bfc2b6a40  fix(25): restore immediate feedback for quiet-hours controls (WR-01, IN-03)
2026-06-14  13e66072443f32e9dfe3ddf60702b11d01468824  8cabbee26ba242c66aa3b372e08e9c6651b2d107  docs(260614-q0j): complete auth-off browser mode plan — web tasks 2/3/4
2026-06-14  2344881bfdc078dc385528eb022a044fa2ee3e1a  dc471d77471cc38b36972d1d8aba8228edbba18b  fix(260614-jfv): align ['setup','retention'] staleTime to 30_000 across all consumers (L-3)
2026-06-14  257804b787364bfd7ed9b9fdc0874a7fbb4c8783  2f1d56610f601f4515d63832fbbf01602389728b  fix(260614-jfv): move QuietHoursPanel dismissal reset into useEffect (M-9)
2026-06-14  2ae3c9f943b0842f864a9b1e3ab9bfed74d26592  f5de3174de14fcd1715e25ee2997cc571e122bf0  fix(260614-jfv): bind beta listener port to 127.0.0.1 (L-2)
2026-06-14  2e5191bac0dd9123fffed5d4a9b0107b6795a4fe  fc6b51b88669c16da0a0f85b771c585a05d2b186  fix(25-3): add in-flight dedup and negative caching to query-cache (M-4)
2026-06-14  379847f864cab4529af8c8efd637faac1c097227  63f69087fae555e97dce266d011c64aabd80ad67  feat(25-02): wire quiet-hours controls through usePreference + presence-check + grouped write
2026-06-14  544e9031457d9dc1a46176c8074a1f95b96f15ae  1df447693c8d42adc3391049279ae93946ea2589  feat(260614-q0j): SettingsPage restructure — Advanced under Configuration
2026-06-14  5c40c106a79d3de37921595e89afc81bf99c9eeb  b8d51ad89cbf353f4a86809ec8bdfc80068ab327  fix(25-5): redact targetUrl from POST/PATCH rules and GET deliveries responses (L-1)
2026-06-14  5d55da404faf852f97b9e6f8617dc932d2f7f315  69c43d67e57ce6b2c2d0f7ba1f23576b7ed53a94  feat(260614-ikn): add requireAdminSession guard to destructive/infra routes
2026-06-14  5ffb6303b2d56b72df3e45c7e8238955a37115e1  d433c1db0b32c81c2f2f0cb41ba1320fdf47ab0e  feat(260614-q0j): useAuthConfig hook + AuthGate no-login + routing + Sidebar logout
2026-06-14  665ff046324e43d601213e09e52f7fbb49c39cba  d1808bfca3d7d60e3072afde6eb4876f3d3e05e6  fix(25-4): isolate per-iteration errors in alerts and matter-runtime (M-5)
2026-06-14  89154e9f27d3af1e26cc4c6aead2e0cb9b95e8e1  f8ab0c4ed7fe15f2ed206d6ae880063d26ea06be  chore(deps): npm audit fix (no --force) — listener 6→0 vulns, web 2→0 vulns
2026-06-14  9969337ad68e1955c418c3ea865ecf7ceb0215e3  4cd4055fb57b234f382b815df574673cb4bedf56  feat(25-01): make GET /stats/quiet-hours session-aware
2026-06-14  9b9af3ed5cca786e67c52e822b1dc84ccad86b4e  7837a58756a6c247f77d57d6860bd447dd7be0ae  feat(260614-sc1): pre-validate invite token + reason-aware card + tests
2026-06-14  aa13a7903afdf995ff56b03c183dc205d2f00b06  b9731abbde41a20c7cd9d23ee8027a33a685ea5d  fix(260614-jfv): purge per-user preference keys and csrfToken on logout (L-7)
2026-06-14  ac2cbe0c7f62d928e18d122a66cd2df9d88e1547  6b8c39c365f8eecc0cb1e3357a51fd7eaa1d8efc  docs: update STATE tracking + mark auth-off browser-mode spec implemented
2026-06-14  aee85b41ece5a5236d3b08a1309cb2fda896c9d7  d1cebc45c8623be25f82e77787563ae91d0cd16a  test(260614-ikn): cover requireAdminSession member/admin/no-session paths
2026-06-14  b0de0cc403cb67b7a5a613f76ebdd998b7408bc0  ba5c64b8864877b52430066a9a943d66664526b1  docs(spec): auth-off browser mode (AUTH_ENABLED=false full no-login UI)
2026-06-14  b68b5c6314aa3039aac407262b5ae33596196371  a929bfb24d43e0f8815b5035f02c0d9701c59a2d  fix(compose): add TRUST_PROXY default + harden portainer changeme (M-1, M-7)
2026-06-14  b9aa3da87283d04bb04ee91e411b2e5b5ca076ff  8b295dc39abdc4bea70d091d473151bb19143e75  feat(260614-sc1): add getInviteByTokenHash + public GET /api/auth/invite-status
2026-06-14  bc4590ca7926c08076baea4446ed10cd5f4ca62c  b88623d0adc70444ecc74ebeabdfc4393dcdb23e  fix(web): three low-severity 1-liners (L-4, L-5, L-6)
2026-06-14  c2bed2a1065597e37d24ec001c686d1da24052c1  db89258600d43543226382d20f8efa38c0c4f72b  docs: review backlog — removed 1 telemetry candidate, fixed Phase 24/25 placement
2026-06-14  c6f92e868e13a850660c895affeb68c7e1068443  8b0b56ed42fc894162a330e83d3884835fb01da1  fix(25-1): reject login for disabled users after full credential verification (M-3)
2026-06-14  d08cfeb985b0590d6da9c439a8690abf0daa22ee  d12869dd515c76f3393e79daecb9bbc1f9525ca6  chore(25): remove stale RED test comments (IN-02)
2026-06-14  d5ec42d9c94c63d5590b47aa23ad441a42a7a6dd  415d4d16f97e04ffc6440a467b85e5008cca893e  fix(users-router): use req.hcSession.user_id (snake_case) at all four sites
2026-06-14  dde4b163a13cec90ca4af44a20d96c910099b32f  a0c7c04b68f7aac7ae1281387960545108145088  test(25-02): add quiet-hours authed/anon/prefill RED tests
2026-06-14  dea75b8eb4d3cb7f5e12cee7aebaba35b94cc6b7  fc24a40d4b383efab5e72a4704568352b535f5a7  feat(260614-q0j): add public GET /api/auth/config returning {authEnabled}
2026-06-14  e038733b4045ac5bfc3d75f65cf8f8b801daa88f  0859a4b8b96e24373a937cdcf848815bacebcb3a  fix(25): guard non-object prefs blob before 'in' check (WR-02)
2026-06-14  eb605cd6b35a4634843eb398b8d1977fd3706fa0  78d3d5d71d3bfc4e9e4ce1aa42607d56d42d7084  fix(25-2): wrap accept-invite redeemInvite+createUser in a transaction (M-2)
2026-06-14  ec834ec11720b3be46ebe40d7f7804a9d162097e  543ea3741bb164b7e709f02468a4342952d0da18  fix(25-3): exclude negative sentinel from stale-serve path (M-4)
2026-06-14  f1c57416b7d00b46d6fe57f96e659b56d2f7f68a  1818ec8354dc1c8e975ae0e44871f188a638ed43  test(260614-q0j): AuthGate auth-off + SettingsPage behavior tests
2026-06-14  f96a9c4abafe89561865b921463096240e603ae6  19f501202822e87b12e119cd1bd39aae87814550  fix(25-6): raise password min to 12, cap accessory array, guard email length, add CORS warn (L-9/L-12/M-8)
2026-06-14  fe1e9fe59db0ca6f73d307023ffc799f6a4a1d2e  6ba609d60f2624c393c17036935665de4dd0eaab  docs(25-01): complete session-aware quiet-hours handler plan
2026-06-15  012b7223be53a1e4a5b704ea49912ea9a484e04b  ad6b5dd0a1a8deeea73e433f5c3596d474b4f1b5  chore: archive v1.4 Multi-User Auth & Email milestone
2026-06-15  11726afb203f400439b56106c1edaf52ef6bf081  1af752adecc14e9af7a059574e082d183344eeb9  chore(release): v0.3.1
2026-06-15  15f93062e968b001f9c03bcd5fffc341a836e3af  80acb998c08157aed214ca3d9efed5a66df14897  docs(260615): add Phase 26 Member Self-Serve Alerts to v1.4 + register MALERT-01..07
2026-06-15  164c9a129465dcf360cf4d69dd8b4a8a620fcdde  d5aa6182732e72cae9efab532f9f4da6f2065c6a  chore: merge executor worktree (26-02 owner-scoped alerts-router)
2026-06-15  1c3629e233ce4827ab7e4685260680124332f796  19bc4d293226e34cd390f90046b84c4ecfb67645  test(quick-260615-r4e-01): add failing tests for Advanced gated inner tab
2026-06-15  2165e1fdcb1debf774d1ea56cd0a38ccf30d775e  7d4ccce5b5dedb08c99ede6b8c2cd89c37937ecd  docs(26-02): update SUMMARY with PATCH email lock bypass fix (T-26-EMAIL-SPOOF)
2026-06-15  249835f065db42b5578119bbdef8ba204e255a8c  a7ea90abdb7124144c2359d979f385856276f72a  feat(26-04): remove client-side alerts gates + nav always visible
2026-06-15  2726e25cdeeae0fa3f4300f8991345da01b7f8fb  1d7104d270679191b3b17e93cae3b3ca11bd752a  feat(26-02): owner-scope all five handlers + auth guard + IDOR
2026-06-15  2ef9cbade473a7bb074f8f37623f9a5f1b102c77  0d79d630d97b67523f6a6384e42120c6ec468b44  test(26-02): RED — PATCH targetEmail-only bypass of member email lock
2026-06-15  316e919ea90a7794e6bd029fbd11e2fdc4ffa26a  bc32a3ab4b521ef1136693bb44ef70d36fb6cdb1  fix(26-02): lock member PATCH targetEmail even when channel not in body (T-26-EMAIL-SPOOF)
2026-06-15  3b630720395f68ddf8bea2745fc7e7823e2098c1  eb6a30282c1c80d64d397c996b121ffc1127b402  docs(26-01): complete alert rules owner migration plan summary
2026-06-15  3c5826df08c242c454628b913765697c3118777f  95ab49ff17260d81758c0be38bba534fdad20d85  chore: merge executor worktree (26-04 web alerts de-gate)
2026-06-15  41cf73ab29d1b2757baf224d1ccb00527a0d298a  3af27334a738d52ba4e56cb7d29720606dab9c27  docs(quick-260615-s13-01): add accounts.md + email.md; wire into sidebar
2026-06-15  41e41367ad0231f66f61b05b4ce87064058a7d77  77b797a9dd84299c745c5efa04fa375a40235c9e  docs(guide): correct SMTP location to Settings > Admin > Email (SMTP)
2026-06-15  46db6a19d05ab570322fa0c9bd818abbfbf4d05b  a1f85a5c49ee7b484a45d5b2f2fd8503cb111f74  feat(26-04): disable Email option when SMTP off + member recipient lock
2026-06-15  5099f3b118b9a623d2eeba1c8214240f6739aefd  109cf3fcf1e6e922def0860eb2ec0eb06f505ec0  docs(26-02): complete owner-scoped alerts router plan summary
2026-06-15  513255734d57deea7b1dfb184d29c2ca392ca382  9f8e39f1bb634e17b6aed96b38d73686c803ed5d  test(26-03): add failing de-gated processAlertsSafe fire-test
2026-06-15  5a6965d444aaffbdd604f3d63d46c8ed2d5184cc  35f7f611003b4a60f9962d0135d48c39ffac9b12  feat(26-03): remove household alerts gate; expose processAlertsSafe; wire isEmailEnabled
2026-06-15  77f507ad79234ee4576de2d1780f865a11d73b66  ae96c02ec75605351edf162079a82ca97d5183d2  docs(spec): member self-serve alerts design (per-user owned, email-to-self + webhook)
2026-06-15  802586ded8c7c448ddde2222385c24b8ec0a10f1  d6045d7e8bde9e74536652f57cfeea12fdeb223b  chore: merge quick task worktree (260615-r4e Advanced inner tab)
2026-06-15  82dcf021bb983f389b00558c7803080107b2c1c4  445a5a2e83daada4a57ef6356c746cbe2dc69b24  docs(26-04): complete plan 04 — client gate removal + Alerts page hardening
2026-06-15  862d436ade456ed2c4ae628ba28586d29633dd2b  50cfe87be8e20ac0b2cf3c2fe76edcad77e7b807  feat(26-01): add migration 0008_alert_rules_owner
2026-06-15  8bfeb2fc061ee277d9ab85065ad30b4758bcf82b  4beeed2961666decec62a3b9cf17f8beb3fbda10  chore: merge executor worktree (26-01 alert rules owner migration)
2026-06-15  8d966e9a088c32d046cd744b9966252634256731  9297679d27ae5424790df2e122920fab4b745a09  Merge remote-tracking branch 'origin/main'
2026-06-15  aca935806c646989ace1a467c7a80c8c1226760b  f577837ec9e25180694d53f65390ad1755e9bb1f  test(26-02): add failing owner-scoping/IDOR/auth tests
2026-06-15  b8152e705e09ef8f4068d7b48ccd87b501c54a53  e895767688f4bb6a88897c4ee39d1c57fc31317d  feat(quick-260615-r4e-01): move Advanced into SettingsTab as a gated inner tab
2026-06-15  bb45e4e966bf2d126dd0b59d233e22bd8e8be90c  5e15322ca96ac0b6c5416cc161122a194b3774b5  fix(beta): route hc-beta through secured-ng@file (Authelia)
2026-06-15  bdc9ebfe03dbef87e8d370a65d1a87e59e7cf233  ce7d2d5dd0ac5b2f6e1fc9283c5129cd5641c502  docs(26-03): complete plan 03 household alerts gate removal (MALERT-07)
2026-06-15  d0e606e017e828b424c5c08100a2f70d0cec12f1  2fc5a3e22588cfacfca771a06c948aa481478794  test(26-01): backfill + column verification tests for migration 0008
2026-06-15  d1e0665f97e974a2715c8f3619da60338ffa4bf6  3bcb5a67f90ff666b947e577cc728f253ebf61db  docs(quick-260615-s13-01): update env-vars, security, settings, README for v1.4 auth+email
2026-06-15  dd81f864520284d2e443ce3fd32701655b0223f0  bad49eb80cdd1c3843dad69812229b3a748f83ca  fix(26): import log in alerts.js + lock email recipient for all non-admins
2026-06-15  e96ae3c209fdb6aae70e9efef29ea671ab6ff4b8  853133e40ab590502d9e01aa3fdb463face608f9  chore(release): v0.3.0
2026-06-15  e9d549c3a103829d0e0dae1e1fa704e377f8de7d  95d80aadcdc3470982751ad33b576a5aa9ee6136  feat(26-02): member email lock + SMTP-off rejection tests GREEN (MALERT-05, MALERT-06)
2026-06-15  fcb9f272df032268fac54544f671837c36871a30  4e236a1c10c3f50dec3fa48965f4704a7ea96c2c  chore: merge quick task worktree (260615-s13 guide docs for auth+email)
2026-06-15  fdb6295412b31e356f55caea807bf98aa86254b4  8f52f17ab4ca99707467c36c5c708403a4b3ade9  chore: merge executor worktree (26-03 remove household alerts gate)
2026-06-16  0d84397f3faeeb2b776e88d8ad07e0ddc314e327  9410a2824f27c282f00fd9bc21abb5ecf0cd702c  feat(quick-260616-rbt-01): rewire all three email senders to compose branded HTML layout
2026-06-16  10726c661e718c63cffb8aad0e2aa78b9719fcfc  9ce8c8337c127fc204360824cf0582a100875875  fix(screenshots): re-capture skin gallery with correct per-skin accents
2026-06-16  1e0718764ea275fb5839f92fcc5180a1610fc2e2  01208a5a134207fca920c448912dd517f865b06a  feat(quick-260616-rbt-01): add escapeHtml + renderEmailLayout helpers to emails.js
2026-06-16  7d42c6c20d3ecad3c7602a1cd10a4da04c52ec9b  f47ddb8d5a7079e8bbe03ab550b59c3a972039df  docs(260616-dgx): add dashboard.md guide page + sidebar/README links + floating nav note
2026-06-16  8be9b0c89bdd14caba8b58cb98991f2702491ca6  40f3c51f209a049c8b9059a1fd13dade9e818491  docs(260616-dgx): embed new screenshots into accounts, email, and settings guide pages
2026-06-16  9b1a3a07df0a2e6cd2ea5bfaa146dccff9cbf8a7  936f8473be36405cb6643e8d22c45080eddca634  docs(screenshots): refresh website screenshots for v0.3.x UI + new auth/email screens (PII scrubbed to placeholders); rewrite capture-screenshots.mjs for current sidebar UI + session-cookie auth + API response PII rewrite
2026-06-16  ab5e3a7f69b803030620e6b43b0a88af0bda6747  b7a13c5a1993d4c97c49a4646feef05b4577595b  fix(quick-260616-rbt-01): escape email heading to harden alert subject against HTML injection
2026-06-16  cbf7e273abb863a15df9bde338c6fa2fba6f7cfd  07696cf824fe94d6609463c9cacf5db109cf89df  docs(260616-dgx): fix dashboard captions + add Accounts and Email feature sections
2026-06-16  ce6f4ea045b58097f9f2c712be9b432e1342fc33  df53f5045dc2e42032435f0e6bd15f9765f64e76  docs(260616-dgx): fix alt-bg on wide-screenshots section + swap duplicate emoji
2026-06-16  e9ab13ee71e37c166f7c52cab114a7228b82a400  19d87e0de9e413481bdcfbb6c8a01bd805182d41  docs(state): record quick tasks 260615-r4e/s13 + 260616-dgx (docs + website screenshots)
2026-06-16  ee042838152825637680959c3628e4809e05ef39  d423b3f725d22d96b22f554fe4efb9b71b67d83c  chore: merge quick task worktree (260616-dgx public docs + screenshot wiring)
2026-06-16  f08aceddc4c02dde678f254e2bd872b71912e5bf  9dc198ea0348d150e407140e06ed614f1e5d1b96  chore: archive v1.4 phase directories from completed milestone
2026-06-17  7ab56000fe0d27de95c08df8d954ee9ae806e918  4cf6f0ed7bd7cd3ce7b234e20415a4df7bc6aa71  fix(quick-260617-f5d-01): distinguish 401 from backend outage in login error copy
2026-06-17  9a8aca68897e9988a583e23a54605de8c03c72aa  c540328d08b5dbfa274ef06cfb3b3dd037397dd4  docs(quick-260616-rbt): record branded email template quick task in STATE.md
2026-06-17  c5d54daab47aeedb9bb5d189b4a29f2c2027bb86  dc4df2b29962cb9497a1e0608e59b5df258421ac  docs(quick-260617-f5d): record nginx re-resolution + login error-copy fix in STATE.md
2026-06-17  f8295c5844c767496834572ddd8a9e0d37f622ac  f9f47921876c5cda11666fd139fc864abb857fb7  fix(quick-260617-f5d-01): nginx re-resolves listener per request to prevent 502 after container recreate
2026-06-25  209c813ae053c9e06839cbf3be9baf25f5375b6b  7a0c7e99676b22c74ca011d0929517797a94e660  fix(beta): pin homechronicle-beta listener to empire IP 172.16.1.195
2026-08-08  566b4e97792eaae0b05d0aaee40442658256f5bd  0505558a4c4e806eabe1baefb9085f4ac1be44a3  fix(beta): repoint listener empire IP to flat-net 10.0.0.195
2026-08-30  0551c6447382fe6f40014b215404e3b037cfd8dc  4a2431d8e0402bf7e379b83b92af9fcac06d178c  chore: merge quick task worktree (260830-1qm beta+CI hygiene: M-11 test gate on tags, M-13/M-14 shared sync exclusions + single-transaction, M-15 drop RW prod mount)
2026-08-30  064fa267d7eda85394544ad6f7bee4ce30d4c3de  387225eef6d17ca66038cc8e511bc1248713e1f7  fix(quick-260830-1ql-03-L2): kill sibling reset tokens on successful password reset
2026-08-30  0f3d5e0c8f337ce51dd81a57f37d9f51a3ca673d  ff9b62ed07919138ab81a6b97946fcf8463e638d  test(quick-260830-0wr-01): cover branded-email layout + HTML-injection escaping in emails.js
2026-08-30  1401967a3ca248ba8862bd10a8010390a5c33117  017a03122e3bfe13915db7c60f05345a774ccb70  fix(quick-260830-1ql-02): requireTLS by default + disableFileAccess/disableUrlAccess on SMTP transport
2026-08-30  17a87cb76793eded431b80f7579c8cf636f570aa  37cd186a511e33ac460305c2301645533b9cc67b  test(quick-260830-0wr-03): make nginx port check a real assertion on the auth-ON render
2026-08-30  18d6be3939cb4d6280325b469c220d33986ac33e  9713f41d5439a259744b5bcd01a3d7889abc15b4  fix(quick-260830-1qh-02): bound HAP requests, cap Matter backoff, heal repair scheduler (H-3, M-4, M-5)
2026-08-30  192e8d0aec4f4e670db1a51bf295e1580f902fb5  c80cbc9e280e462041b5b512ed37305e40e7c506  fix(quick-260830-acc): /api/accessories no longer blocks on unreachable HomeKit bridges
2026-08-30  1a3d4403fcc3858d4525d42f5b12467ee0355ce0  1c9fb845fbac2e9724443664470b6a305893f2d1  fix(quick-260830-1qi-02): string-normalise users-router self-guards (M-2) + password-change rate limiter (auth L-3)
2026-08-30  1cb5da9f99cffd85b19d939868d11a0e42c3ba7c  e9e62c636a8dbef65fee8b8954933f3a87d7528b  fix(quick-260830-dfe-01): gate prefs flush on GET success + merge server-side PUT
2026-08-30  1d03910c6d9f8ac134244e26b123ca1a59c43276  19610bdae0187354726afc5fe38e005c3b7ccccb  ci(quick-260830-1qm-01): gate tag/BUILD_TAG builds and release on test (M-11)
2026-08-30  21c85c0318e357ef21fe3c38796632ab180cacbe  c84b78b0dc7daf86eb5705064ab355d1c2d782c6  ci(quick-260830-bsq): beta deploy calls Dockhand /deploy (build + recreate), not /sync
2026-08-30  299338626675d641b6c7c164184f324fd1f123a4  306cea7636909ffbb101e7c059dd4f2f13d95a58  test(quick-260830-0wr-03): assert nginx resolver override, auth-OFF parity, host-mode, and composition guards
2026-08-30  2c1c32ab5c41e1e9cf12f370938bae5aecba57f1  107a4f36dc5a30baa68f2bbe68e37cfc7bcdc037  fix(quick-260830-1qm-02): one shared exclusion list, atomic host restore (M-13, M-14)
2026-08-30  360e6dc9dee7ea9f38cc8076945597a0ba0e3fd2  c45908134258d3e509fe492a1f29417a53b7edd4  fix(quick-260830-bsq): sync alert tables to beta again; strip the alert_rules→users FK instead of excluding them
2026-08-30  37f78dd178378d6e97119e576bacb0005731e3c4  b6940b16c328dd07dc7a1b196cb2fa2de2fae76a  fix(quick-260830-1qj-03): legacy-admin alert CRUD without a session, fix PATCH lock ordering
2026-08-30  3f85be2c86013ccd20c59b13b41a01d962ee948b  dac40d424083e15bbf64379831d0f69e9ad79576  feat(web): room colours follow the active palette
2026-08-30  401702e0f9e9780af6c1937977cad2c8315b3c34  c6ee3cfcb598600c623cbb242d52b60c7ddabbb3  chore: merge quick task worktree (260830-1pj v0.3.3 hotfix: H-1 nginx /etc/hosts pre-resolve, H-5 standalone migrations+patches)
2026-08-30  47170e6c81379f902026e85d0601149be72f2faf  2b7d8b178b6ef6fad74ef199a91c070c315e35ab  fix(quick-260830-1qj-01): stop disabled owners' alert rules and add admin all-rules view
2026-08-30  4806578dfc576c3305c938a6439f8987dc935bc3  8de6e646956eae1a4e4b0b0b6967b97d18717d4b  fix(quick-260830-1qi-01): key rate limits on Express req.ip, never raw X-Forwarded-For (H-4)
2026-08-30  522c065ab3deb7b3a1927ef6e69b4ee49c23c147  066e4d0f6cf4b6353626fcca41b27b808dd0e522  fix(quick-260830-bsq): schema-qualify beta post-restore SQL (pg_dump resets search_path)
2026-08-30  5a6c85fc9f9c35e2b5b9c315c7ad0469ea88fa0d  b06eceece2bfb1130219cba80e0412af4d0ee798  docs(planning): start milestone v0.4 UI Overhaul (phases 27-33)
2026-08-30  5c3bade31a9c47fa629cf7166c8431173c6f9ae9  0a9e0b40efc2d34211957a9e16a7b31b0f7f828f  ci: point deploy-beta at Dockhand's LAN address (dh.venamis.net is gone)
2026-08-30  5cd01cf7ad7c73a022ccfe18cae356c3f3b68885  1e7e78846f7ae30367fdc18d65cf5b277ccedcb7  chore: merge quick task worktree (260830-1qj alerts: M-1 disabled-owner gate + admin scope=all, M-3 rule caps + bounded fan-out + failure suppression, auth L-2/L-4)
2026-08-30  5ebbe521863a10f50fcc49c4d9bbb27950b6499f  359b8171163e108ce69f3c07c9d20066e02c7553  fix(quick-260830-1ql-03-L4): attribute-escape email URL slots + validate APP_BASE_URL
2026-08-30  5f105df87c0f4903000e5db587a86fd930f1fd6f  e75dc28a13107c745f0a041ec1c70fed2458520f  test(quick-260830-0wr-02): cover LoginPage success path, status matrix, pending state, and password toggle
2026-08-30  5f50db412ea8d4486f7c6ec8f2ae54ed0e861c6f  8071f5a718a5b511205b78db0f400565ef2c2b80  docs(quick-260830-1qi-03): TRUST_PROXY as a consistent hop count + nginx X-Forwarded-Proto pass-through (M-12)
2026-08-30  659c6b71582fbf018dcc5545c143c13884a70ac5  5ac340e8e25eabce929e0b84448020ddce1e35da  docs(state): log 260830-bsq (beta db-sync sequences)
2026-08-30  68816bac37aae8f95d9cae7ec067685ae7cdb3a3  8b31a3b16f4ab0ff8ef65e1732995ab3370bf824  docs(planning): track PROJECT.md in git
2026-08-30  6d86fddc93a661dea4ab3c1433c83389a9b29a3c  9b0fa3874d087b1203e495ccbabd3b46908d2b18  fix(quick-260830-dfe-02): Timeline reads per-user grouping; QH exclude writes the per-user blob
2026-08-30  7c328c89b30cef012549c019d41e422cc580b09b  a7b8c19c20e4f9a59463136311d645d1deb1720a  fix(quick-260830-1qh-03): graceful SIGTERM/SIGINT shutdown + stale .tmp-* sweep (M-6)
2026-08-30  8562fa2ae42fd57d826072d9d01c58d01dd093cf  21a9a303b09d84d705cdd3b4fc37bb2323f3a161  chore: merge quick task worktree (260830-1ql deps+email: npm audit 0/0, nodemailer 9 + requireTLS/disableFileAccess (M-10), react-router 7.18.3, email L-1..L-5)
2026-08-30  8cbb0f5d7650daa76a7e404b4f4c6022dfa0e43d  71805dd72b68059edfa2228f70fbf35759493528  docs(state): log 260830-acc (accessories hang fix)
2026-08-30  9140a79291cb3cfb0e919b727a0cfe6927373c09  93a449e3ebdae6645aa4c01db02ecc7f3f813986  chore(release): v0.3.3 — audit 2026-08-30 remediation (5 HIGH, 15 MEDIUM, targeted LOWs)
2026-08-30  96058d0ebef25168d5380f58a72f50758659b62f  4b12d106f1fdfc3c6658d2994e16be61d0453dab  fix(quick-260830-1ql-03-L5): range-check port and require a non-empty host in PUT /smtp
2026-08-30  99ccf167971dc0eb778875cb766fc53c889d33c3  6b8361f0b0a1db05a350edcf46a602f76200c04c  chore: gitignore .lanes/ and drop it from tracking
2026-08-30  9bc7feef307b4d493f1a97042d9eeea6144cc526  2f98deea054341f1427e668ed513faf63b76fc9c  fix(quick-260830-dfe-03): functional-updater setter, prefix-based logout purge, auth-gated /me query
2026-08-30  9cada5652b75624130a710b168b843d4bf64faca  8c60c2da62d211708aaba732e1d8d6ca5c73e7f0  docs(quick-260830-1pj-03): release notes for v0.3.3 hotfix (H-1, H-5)
2026-08-30  a39bcb0a9d8f74f736a2c6ba94bdcaa447f19aef  563173fbbcc9f9264c317bf94c3ab255ee64ff58  docs(quick-260830-0wr): record comprehensive tests for v0.3.2 changes in STATE.md
2026-08-30  a50afc015c3d4523e99abca4179f2b5758bcc433  ecfc3c81c8c43f040cf187004b5eb9336f0ced34  chore(release): v0.3.2
2026-08-30  a81d344671c55cfe8d0579ebb9acaeba56a2667c  694b35e1c1e3603014ee9d67a2afcd6456c5496e  fix(quick-260830-1qh-01): patch hap-controller undecryptable-frame infinite loop (H-2)
2026-08-30  a87c52f52a2b004de329fd4cedb75ddb717f30ac  dfb97963aa4f6e590ad6d30f81cc01fb5a40a880  chore: merge quick task worktree (260830-1qi auth/limiter: H-4 rate-limit key via req.ip, M-2 self-guard string compare, L-3 password-change limiter, M-12 TRUST_PROXY hop-count docs + X-Forwarded-Proto map)
2026-08-30  b281b39d18ccb49972528ad141747d4198a097d8  6206a16120706fd7be7d2315dff99ee919ca57fd  fix(quick-260830-1pj-02): ship listener/migrations and listener/patches in standalone image (H-5)
2026-08-30  b34d372be99872400a3ea5338c3fb368aee9e9e8  ea43a1ef2c5df7fdadd2ed0c3b721e338316fd77  fix(quick-260830-1qm-03): drop read-write prod listener_data mount from beta listener (M-15)
2026-08-30  caac559c8e575489d0efcd1c494d7f9e02e40071  a1a0a054e0aad9f764870651d4ce98a69d559e42  fix(quick-260830-1qj-02): rule caps, bounded fan-out, failure-aware suppression, text caps
2026-08-30  cdaaa77eb7622a13e2e9e1981333d0f5c8802efe  c858d9d95618f3e3ec6814c0dc70d1adf2ecdae6  fix(quick-260830-1ql-03-L3): PUT /smtp reports emailEnabled truthfully
2026-08-30  d10f1d6e0d39802411f65bdc94b5fd41bf80192b  5cc21cfd619bc4a692131cd4b1519ec56219b772  chore: merge quick task worktree (260830-1qh listener reliability: H-2 hap-controller frame-loop patch, H-3 HAP timeouts, M-4 matter backoff, M-5 scheduler recovery, M-6 graceful shutdown)
2026-08-30  d7e36444e50d8a5a0f1bb5b6ef88d188fbe91d36  d89ddadda0d57f8d22f39181f6b60605ff1ee8c7  fix(quick-260830-1ql-03-L1): validate invite and claim-admin email addresses
2026-08-30  d8e26932b26c1ed375f2e232bbbdee89b6d72b89  cc129dc0ee051c8bf6aac8c68014f0fb4234789c  feat(web): Appearance settings — theme and palette selection
2026-08-30  db99dd2bb5e150e1e9bfc79c87ee914baafa7b51  6c3e906327e8091c84df0df2732953b0ca0a58b5  feat(web): masthead navigation shell replaces the sidebar
2026-08-30  dbcd77fa2d528113c68c7a46c147ca2772dab51a  4f9c749ee018c148e1870e18e7817c3218a70794  docs(state): log 260830-bsq continuation (beta deploy path)
2026-08-30  e407e802300a7454b8b99812d36d8de758fb047d  617aeb4803849c92ac9c8e38f11fc1f87e8c950e  fix(quick-260830-1pj-01): pre-resolve /etc/hosts-only LISTENER_HOST before envsubst (H-1)
2026-08-30  e47303d6b751b1a53d542c15e6ba1db04d2b19d9  c7f8ea20311c85a3a9692e3b2af1ad90fab130eb  chore: merge quick task worktree (260830-dfe web prefs: M-7 flush gate + server merge, M-8 Timeline per-user grouping, M-9 QH exclude per-user, web L-1/L-2/L-4)
2026-08-30  f276be193c168c9ccc38aa8795d3eda688431f12  e7106da0b215234099d3191cf73621b8bd7459cc  docs(quick-260830-1qk): record CI vitest worker cap in STATE.md
2026-08-30  f37e38ecca9e20a3dfa14bc5b3b1b202287dbdfe  b46c059e7411b91cd8e2723ea8f4aaeb160304be  chore(quick-260830-1ql-01): npm audit fix x2, nodemailer 9, react-router-dom 7.18.3, drop dead override
2026-08-30  f3e5a369808e0a2a5a278828f2ce31c557da16ee  f21b4f8dc761be8362c7268bf8f08fc77045f93b  fix(quick-260830-bsq): exclude BIGSERIAL sequences alongside excluded tables in beta db-sync
2026-08-30  f69800badef8a463a361a06cb2cd20850cb8724d  3f53b67802b9ee563dc5e39d6da009a96c9bc7eb  docs(state): log 260830-fst (.lanes gitignore)
2026-08-30  fa7150c8efd260ad397c1e4b9efe695b2905b6c8  07aba19eae7b6328463463a079f78acd02269063  ci(quick-260830-1qk): cap vitest to 2 workers to match runner cpus=2 cgroup
2026-08-30  fe9f7bc4c5aeea618e3272950c1d2e58734d7826  d1a0787fe0d8c146ed99c06075d54f1119b66c0e  feat(web): palette + theme token foundation (12 palettes, light/dark)
2026-08-31  1e4b75b3359b267be69a16cda3eb44738bfd4fa2  11f16c95065fb144670ba14b549de08b11d05d3a  feat(web): palette-driven charts and the composed v0.4 upgrade check
2026-08-31  3039e389705cacedcb828e9f54f555865353c701  8da63b0ea8cb3d0b9f17cca62dfecdf982151272  feat(web): dashboard restyle — hairline surfaces, Almanac default order
2026-08-31  415a751efbef18d9068533d21bcc185d1b947d90  ab8cb4712029fd51a26f8724c0fae0e2593a5d44  feat(web): About gets its own Settings section; fix Appearance shortcut and arc labels
2026-08-31  5147608203a7819c7033fd2541bc2934c0f215da  66cca93e8b6fe0c9e505ba0f86d34e78ead34cff  ci: add a boot-smoke job — start the listener and wait for /api/health
2026-08-31  660cdaee8a1cb82638ef7425101da40409234084  50524fd80443e57fbedd008aa9d7e6a4a1087fc7  feat(web): House Summary, room map and rhythm panels; fix optional-panel seeding
2026-08-31  6a3f61ae4aae13f7f17f46579c22324cf0645697  6479af3f3f1917b6e949b9ea9985a77474eab090  fix(web): flush preferences before logout; account menu; version moves to About
2026-08-31  7054792e78275c1cef0467ef2c4b1ae18bc0c0d7  1c700ae1c818aa000d0ef80e61269e4ba39e451f  fix(matter): repair boot under matter.js 0.17 — StorageService.location is getter-only
2026-08-31  7b1fef890646ae025cc7c64027624af3a4fe4e62  f8191da6543cd3e3929527623e668b9d01850df4  fix(web): one About section, not two
2026-08-31  89bec08c4075832c9565413b62683ba7e804b0ca  8e1d5a0d775e6102c2f017a88cff5ac5b1819acb  fix(matter): normalize Matter readings to the HomeKit vocabulary and units
2026-08-31  961f7c57b130fe2d2d34600d18325cfad6498f56  53952fac82b2743cd038a2ac7013da6e5c829a58  refactor(web): sweep the last 245 hardcoded colours onto palette tokens
2026-08-31  98c44025575c97e5e1ba7b0b2e9c42e2fff4154b  eb3f2530f76f832ed1a6c38f209fe934203d257f  fix(dashboard): collapse the dead space under the house-summary lede
2026-08-31  a0e3a31b7d9d4133effaca9d5a9444864f9b7f6d  a33af4161c57df42b6b72ea33ac6ff879242efa0  test(alerts): drive the settings router in-process, not over TCP
2026-08-31  a1b20d8b8bcca4666d27c17b9cc6fdd5c3ee488d  acb54420a4c17c6ffb4b445d0a99f31c28387174  fix(web): flush preferences on page hide, and send them as JSON
2026-08-31  af24357f0cc0cb64ec99225615c2c4e823272ef8  98bd4ab011325690894361daa0f77931a13be90a  feat(web): Timeline and Devices restyle
2026-08-31  b2002264850a9cd4a2e4f17d207b23414ca0f4cf  5f409ca63f7c6760ab7c0cca2f5a172d2385ccca  fix(alerts): finish the MALERT-07 cleanup, and run alert rules for Matter events
2026-08-31  ca0b909669ff6c18cfaa3fd55f18874f913ea83e  dc0c782208a09fd1347e16d0a609e2c2abfa8802  chore(matter): bump matter.js 0.16.10 -> 0.17.9, add a spec-drift guard
2026-08-31  d538c4a34ca7f634dd4c8901a40dd73f8a6bed29  f05357eb3bd545dbd3fe8bf495070a7bd832833b  fix(updates): check GitLab releases, proxied through the listener
2026-08-31  e77e01aed6fe50d4e375c03c6ec1ef301fa6354a  695f7904570440b85ac0e309c180552016a31551  fix(web): read the account palette on first paint (AppProviders)
2026-08-31  e95b741bfc926c7c2aca53f4599921f47b58136f  36e94ec800e77851f22b7365ba811c9418454d08  feat(matter): subscribe by default, with a reconciliation poll as the safety net
2026-09-01  046fd0295ee9e7488363b522742d353d6d6d86e4  cdce28be7674032a6b42ed2f37f4d656e2fe39ca  test(subscriber): wait for the reconnect condition, not a fixed 200ms
2026-09-01  aa51f613a384ee0d019ddedda52808cbedbd4613  d4b82bcd9f52ab0c8fc1de498a170140cee6a86d  feat(updates): make /api/updates/latest public, alongside /api/health
2026-09-01  d037f2f170859cfa97a516338bcaa2de52a1b31f  0021836e66aacd41d0658f11a55f938c576be76a  fix(settings): keep deleted accessories out of the Danger Zone history list
2026-09-02  209d0d737978ea173ae94892f2310e3e6b841129  75ad632ec5e1a4295c9634032524e171d7c372f1  chore: retire GSD — migrate planning knowledge to docs/, remove tooling
2026-09-02  40676cd86c886dde69762cbc7930622546712113  17710e6702c43bba39d7b3efc4a6bd2a69090707  fix(dashboard): correct house-summary regression from the truncate/maxH fix
2026-09-02  5834120ef93902c2975a2e245d45be984de3f259  d080f22ad4c5d59b3221257ff92c5d0a798d7698  refactor(web): remove redundant per-page headings from all five tabs
2026-09-02  b111d0576c384e5dd497163d39fc6c22dea04c2b  7037fb906465d7d5272412e4b61a2205d00108b2  fix(dashboard): make the house-summary height fix reach existing layouts
2026-09-02  dd8db0803171a4f9f806e4653d24341860d66a91  d6149e82218287f011c4c0432c225019788ee0a8  docs(dashboard): document the mobile truncation tradeoff on house-summary
2026-09-06  5a7a71d9e755d1132e8b76526a56be943ba6e12c  6f3824cf3588b59310b30b202af48b3bae1dcf08  fix(web): sync theme preference across hook instances so System follows the OS
2026-09-06  aa13dc41c2aa8829df73664b7bb3ae4bbaa13e53  07332d7b15507e06bb0759e54caf904ceea38281  fix(dashboard): make the KPI card row fit its grid box — the last widget gap
2026-10-11  06964c5db5ee447276a4fa3f15eb8b14226b8baf  c6f459afce4073845057a79e34cf3ed044505d81  fix(web): move the first-paint theme script out of index.html
2026-10-11  0e39f4d5b7c8f04204d0084e78272b9fbf84deee  2a9ef714a2000f1b183a4852d676f026938c4112  fix(web): readable labels on room-map blocks and accent-filled buttons
2026-10-11  14e975cf3900d89c7591b8c38d3231e37b2440d3  5c0ebcb0b08d4b6468dcc790bbb50fc3296c28f6  docs: recapture screenshots on 0.4.1 (local-time heatmap, Matter wording)
2026-10-11  2efa6e8d1555c9bc500ab334b56dbef607dfde61  dec3b6c632b93a6c4587ddb0355528ca8198fd89  fix(web): keep Today's Rhythm busy band on the dial
2026-10-11  52e09993972f607a8059ecb14fac395dbb4d0685  e44a47669053a205db22b3cc38d65840e4096fe6  fix(web): carry a signed-in v0.3 account's accent over to its palette
2026-10-11  57d2ca71070a261e60d4f7c07e1f423ede2aa281  1e8b65571f7948db0732547b1764e04c5b1d3add  fix(web): keep the floating nav from covering the end of the page
2026-10-11  589c167666957c148f3e4a777a51111f89032dbb  79d5b36f40abac3ceeef8a8f684109beffbf984b  chore(release): v0.4.0
2026-10-11  6209a45fe6715f504a6934f9348cc87095233437  856eca64f706924bd5e4afdcfa66d2329665cbda  docs: update the site and guide for v0.4
2026-10-11  a37c65f119bc9e0e83549dac8fb6e6a5efb89ae1  1c3fb057b672e56259bcf1d2670f127bc5f7abed  fix(web): label the alert quiet-period field
2026-10-11  c7515b47cb9337d62ba865bceb41f6b73a499318  0fa09ef883005f225fd5364fbdf67bd7f3ec4f86  fix: local-time hour panels, live alert settings, phone sign-out, honest update status
2026-10-11  d7854249092a65b2f12022b2caebd3d02b700923  096ede74780a08c1f9892526f28b2f7835cb6142  chore(release): v0.4.1
2026-10-11  e24ae5184ed4fe9aa083aef025fb08f52d4a1180  f3cde7f0ebd6c0f5a7a50a8e3abb4a7f7d97b4d5  fix(web): give device names room on narrow screens
2026-10-11  f226f1ba6d5d741b34490633f38e8a65cb7d29d5  1ca3aa06d54f95fe03b4920f9f28a6d78e952441  chore(release): v0.4.2
2026-10-11  fc6a16ba0b2738cdb1d18863bddb5f73de272652  20f326e08cd50ac7b022729bedf3f153f36feb88  fix(web): show outlier hours in local time, not UTC
2026-10-13  162d9eb71dac260cce7898498f50378df4696584  5cb111155933d1f1b844646b6e2f41f950009214  docs: recapture screenshots on 0.4.3; retry palette shots on any failed API call
2026-10-13  307e05c8acde030d4bba42fc1144dbfe196b9375  789c5cae6528270792bee7344d5778b694774965  chore(release): v0.4.3
2026-10-13  4a59829d27f339e25192131974f07916dde398fb  d05e87909b5c4067197837ce338196306fd35292  docs(guide): fix the Issues link and the App smoke test description
2026-10-13  526c2f20f2b684ec3ae09847690b98a3ebe3b80b  20b349442fc1862d6f13d649fee7dabdacdcae41  fix(web): don't paint the whole rhythm dial for quiet hours starting at midnight
2026-10-13  640c74b68c1cd98300b32e037a0ab020c7c03292  6036fca123525db6c63bec0630b1d2c48b1bada4  docs: recapture screenshots on 0.4.2
2026-10-13  9e4eadcc327f62da8bab29d99aa1bb4131aa5865  666b16dfbdf3291fcd379535a13b3dce5d097c2e  fix(web): don't show default quiet hours when the real ones are unknown
2026-10-13  e20167b424006516c265e8ed8ad156ea06a04483  f601f7e73e324231a96b172f1d1cc79812a810a0  docs: recapture palette-almanac-light with real quiet hours
2026-10-14  4641046e447c5a429592165772ef2735fbf1b854  241b616c98c5239d2b7b70d2d8fd68cbf2f93aab  feat(web): add a test toast button to preview toast placement
2026-10-14  58331d8dfefa5bca8fd19db73750390b78ad1091  e56d319ccf7b5104d328621577502cc329cc7f59  fix(listener): key device anomaly baselines by accessory id + service type
2026-10-14  5e9114950ae447c360347a6e5179d091f715abaf  100f2d4ee14744a65277e339c49c0f6e266b09ff  test(listener): poll instead of sleeping in the remaining reconnect flow tests
2026-10-14  85550b0b619a7014bb4360e705319215933c6cee  35c225797e7165fe4fa8f427b522b8e9fd36977c  perf(listener): aggregate anomaly rows into buckets before the name mapping
2026-10-14  ab9de51231ea905fdc3db5852ae29f21e41bd84a  11f234da52f9d8fbbbe8d2f4a76ca3b6004fce13  fix(listener): choose HAP pair-setup method from the accessory's feature flags
2026-10-14  ac0e90a0c34a6d9e99fca17bf8bb1aa408c5f0ba  6a4723473ff670c4a3a25e5115712a119bd783f7  docs(site): legible account screenshots, click-to-zoom everywhere
2026-10-14  d9f24eb86d8a314e162fb69f8b1fa4162ff3421f  1ef819fd1ade3359a9f266ccb3e52bee1cfefb69  fix(listener): correct HAP short UUIDs in the watched-characteristics map
2026-10-14  e2fa39843f869a84cc5ad59d9e31662f2ea05535  c59dc4a9abf6861bd61d3a8501396e5dbc4e91b5  fix(listener): keep legacy "name · service" accessory alert scopes matching
2026-10-14  ee73bf6b6f98d8c8f3e1ff1e677ec1428c5a1b84  624a20c4f437633bc09adfb93ad758a8000a3445  fix(listener): retry pair-setup once with the other method on a malformed reply
2026-10-15  5b2e79c764af82f2f8a4b8c636e2a94e9c263c86  b30fdc58ef14c204fd8a88d7d19a9893ec5f79bc  fix(listener): don't crash when an mDNS send fails during HomeKit discovery
2026-10-15  611a52b89808b48315172ea99d9ff45ebbdfecd3  801f96c6f22cb21600eb3eb16329fc5c19d3e850  docs(guide): macOS installation — native listener, Postgres and web in Docker
2026-10-16  4e5627c7270576ee2458b8fb7e30bb50c80b9031  b3e83cd90be26adb148cea18325281ad8515cc64  fix(listener): report mDNS send failures in the discovery CLI scripts
2026-10-16  63b57c704dc9e1f8f664543b00b9259953f6b037  2ecf7795e3bbe68180020cf2401f012a7ad6006c  docs(guide): macOS troubleshooting for discover.js stopping with EHOSTUNREACH
2026-10-17  426150293d39f2e05116ec25da9c320079a57160  dd7f579c1586914622dbacb4716efc4285ed436f  docs(guide): route native HomeKit devices through Homebridge for Home + HomeChronicle
2026-10-17  a054687b94bca9b0c6cdab12719e36e9b29349a5  472fdbd3105833883e65551f341d7ba60489d80d  docs(specs): localization (i18n) design — en + de, per-user language
2026-10-17  e2154f77913221216729b9ec06b8becf8233125a  71fe780a4fa1f210847a807f3976ed693b0c7f1b  docs(guide): listener picks up new bridge children on reconnect, restart is a fallback
2026-10-23  b5b2922b4909d676772edff1056baede92be6f9f  28611af9c0989e23f8fdd6a5b7e68ed956544667  docs: park localization — design kept, idea filed with resume trigger
2026-10-24  06040ddb887440c49c85f0bbe9600d24b8e32376  88188f09e7b508f36bb1eb89b195d73b4c0352b9  fix(web): keep preferences in sync across tabs and devices
2026-10-24  1f10659c14695679c952067da02f5a145f5c9b93  898d152ff69b74ca3b8a492e64ca6d0beff31772  docs(alerts): goes-quiet rules count changes, not readings
2026-10-24  45bb8da6e2e9b7f519fc82d1e77b65e6f9168b5d  f706f52941e5f63765fe075a57ea2f8ff174a635  feat(alerts): goes-quiet rules for devices that stop reporting
2026-10-24  46c258231e36acfee64b09bd37648cffadf0b894  528bd7ecd75332858dcb2b701e31fe2818f85a8b  feat(timeline): export the filtered events as CSV or JSON
2026-10-24  6463ea0abf3e07b831565860e605856b5204d7dd  fd5ee4ebd7fee93845b2c7f7b0ba683e8d1d6e58  feat(alerts): rises above / drops below threshold rules
2026-10-24  68524fa9ac8c0475bd09e194a82cc9190c7287ad  4e2160cef3638c00af463329d4a7984cbd3c4d49  fix(dashboard): give Device Categories room for six categories by default
2026-10-24  78bb204527a1320437e53e2c4096998c80433408  82668f14aa02546ff7a4c385b237a1c1e6f2b693  fix(listener): allow PUT in CORS so cross-origin UIs can save preferences
2026-10-24  7e8ac46dcddcdb175b15e940e45d5ff02b2de71d  bc4c9272971745ad0d28ac738557bc2f6733a447  fix(alerts): a quiet alert sent before a restart still counts for that stretch
2026-10-24  880e3a120ade25e603ee47d8cbd6bd5f9779b254  a3cde8c7c315b2eb3b0c8d693c68809e33d73099  fix(beta-sync): let the listener replay migrations that reshape synced tables
2026-10-24  9ac5e7b0cd2e859c01461ca38c5b70ecffc82006  df3285827e997fea1abd44ed393f69d0c59db3bb  fix(listener): expose the export headers to cross-origin web UIs
2026-10-24  d4f9ea8b5adc233bda8d21f6ebf4a33ca3721747  a9ecd459ed8630d2b3060334aa54c49eeb3094c5  fix(listener): keep negative numbers numeric in CSV exports
2026-10-24  db321e8ca2a386a820a71a91b1d4444185430114  35a5da65a3df5ee3a9f1446e3e8742f63244f7cc  fix(web): retry failed preference saves; follow other tabs only for theme and palette
2026-10-24  e73a0cd3b6150c2b64dab688bdf7bb1e85a025c8  3b31815d3d377d49d0b5c65c34bf9d066f86c43b  fix(listener): write a real UTF-8 BOM at the start of the archive CSV
2026-10-24  eb781ad287aa84713e1ea2161ef28d330c0367ed  96eea1dc8510640a44ff4b31035847c09843bcbb  feat(dashboard): device categories with automatic detection and overrides
2026-10-25  01ba64ba406354e01a283c4c256ed7105a0c02ff  8461fd44a085f615088d6d9c58269b19a0a61329  fix(listener): abortHapClient just closes the client
2026-10-25  033f7e19b0a3fa6df545ca4725cb8623d56d82a5  411056c2961f8dfee280a276687e90e7d4adee66  fix(alerts): validate the whole rule when PATCH changes its operator or threshold
2026-10-25  18d411a7be4773ba276b8b207b908e69497f6db6  41f862e2b55f0035dc6072445a0315f41ba68d70  test(listener): add a HomeKit multi-address check against a real accessory
2026-10-25  18e12aa92fe7c51932e85667df70bc7048c48585  c65e56d163d8fa998567e31e01f5a5d4e517c0b3  fix(web): fit the Settings sub-tabs on a phone
2026-10-25  212385fb86c067abdf43b0902b093d3f5189bceb  3d601cd2eca057afe350d15e71213149d9c0253d  fix(listener): stop the events export on disconnect and honour backpressure
2026-10-25  27e6096284a75a1eb077a78317fa3164cf72f960  4e7da25dd8c756aacbe39a47e22c9f8d05f3912e  fix(web): keep buffered preference saves in their own account and tab state
2026-10-25  4a648bdb597be2880d4923bd1971486b3329e02e  51a5d7a1545d989c49a5be27321c564db10deb5e  chore: strip AI attribution trailers from commit messages
2026-10-25  55d7a0eeb9c6f1d3836bc083a511e2dbc5af4fcd  71030279c5900b536bf46acce63761be9a18799e  fix(web): give Stale Devices and Quiet Hours their own colors
2026-10-25  6806b5b1b98fc659022ed826456adc2d73191106  1bc3945eb82fcdaccf96983b6f4450cb90bde684  fix(beta): let the beta listener replay un-stamped migrations out of order
2026-10-25  6b56ed8c401cf78b8a8e47d2abb873bf55a546b4  a67ea30d57672f14045ca037762b2e1caa104743  chore(deps): fix npm audit findings in listener and web
2026-10-25  6ff5c4d231a272db87811f6e6990b4ef5515949a  aafd96542301e667083e948159544954bd0f54d2  fix: second-review findings on display names, export check and addresses
2026-10-25  7de5e0812eb8094a000b90e5ef0b5efd4464ff46  cc6a8455b23c2acac603f940a5162605381a3672  fix(listener): keep every address a HomeKit bridge announces and use one that works
2026-10-25  7e7530f5e24d6119ed8df9288a17803b6cda5e7c  a155cc4a62a9f4d280f73df13d5926706d99ddae  fix: display-name renames leave shared alert rules alone and never strand history
2026-10-25  94a447e250e597e5678636620de5415e4b2fe3ff  9c60ddce226680ea262b3604bbb0faaf10501807  feat: display names rename a device everywhere, past events included
2026-10-25  a1273abe502c0eb5ecc5d7940be876eb89e38a5d  14759ba61e30c70b1fc6c99e2215fdced8a0bafa  fix(web): let the browser stream Timeline exports straight to disk
2026-10-25  a3712e5fe939d17580fd1adf65c4907da3b868d8  f95e95d9a8c6aecb679f7fcdc124d2a292c889cc  fix(categories): resolve a device's automatic category over the panel's window
2026-10-25  c2bdcf3736b1c33dffc72ad22420581ea96ba09e  36d46777232750c174d2d3c80d5c6161d4269209  fix(web): shared download helper that doesn't cancel Firefox downloads
2026-10-25  d4a0e9f58087feed4b46a8bc58bc9b6a4987e277  d026203e2443636531b79faa68e14286ac2e9f03  fix(listener): close half-open HAP sockets and don't abandon a restarting device
2026-10-25  de5bcd6abb72e248836ee6e22b00e3586e59288a  4376865ea2355d38e852d600557452b0a3223a0b  fix: code-review findings for bridge addresses, display names and export
2026-10-25  ebe62ede7a374c59c023c26dd6131c2dbabb1e0c  e19766146f5c9527560d7ebc0c943515351cbe8c  fix(beta): sync prod's data into beta's own schema instead of replacing it
2026-11-01  1d36b907aee9f021d9201fe8fe671cb90cac29c0  49f13b6eeb803019ef8942f573fbabf891afe70f  fix(listener): quiet devices count as connected; slow, quiet retries for devices gone from the network
2026-11-01  37f0adc32e3c4c99341d76fd52f5bf0726d07d50  44bc8a61449f4c7449a39c9fae02bf11c408c332  fix(listener): refusals never escalate; reset doubt on events and reconnects
2026-11-01  4387669795c524a305dd7d312bcacf90125a502c  eb0453ade6997f5e38113498acdd515160ee4259  fix(listener): probe quiet devices for liveness; keep discovery on repair restarts
2026-11-01  4aa78002ae368f6ecdca216b93d3b2eb71592e07  2feac315324e0cf93fd25c03bf53e7e8ca2731c0  fix(listener): explicit probe results; no 1 s re-arm loop; escalate persistent doubt
2026-11-01  602d8cb2c4272d88641f817651f7fff8572973d3  405845bfb1701b719d7d63ae53235aabed05cd15  fix(listener): a refused or failed-auth probe reconnects; no stale timers or catches
2026-11-01  89333f99b5c166a8ed55d9ffe15b598c5a3b9236  40b02d66b710eb2f7e7b7558b167744c3609b2dc  fix(listener): only consecutive auth failures escalate a probe; re-pair retry checks recovery
2026-11-01  8dc8ce08034b4c86539c9680020d72384e0ee53d  e6fe12178a6b9d907319126fb7a2c3cffb5a0eb9  fix(listener): probe the accessory's own name, count any answer as alive, no racing reconnects
2026-11-01  b3b68578c1990f0d51bf9e4c74262010e761bf60  0db5f70f180c6c603527b2e87f1e09a1c01b2929  fix(listener): resume after auto re-pair; probe tears down only what it can prove dead
2026-11-01  d58c698d5315309b484ba481602eae9a26cda120  8d986f2dfd4d2adac868f6053cd62ddfa7632904  fix(listener): one place merges stored and in-use pairing; warn on the first failed pair-verify probe
2026-11-08  12c8338a018fef4ddedb1400c2d4ac47d8a794b1  3dbb52b54bf9064f722170aac3e87703e3718dd9  feat(web): temperature conversion and formatting helpers
2026-11-08  1c195cbe35ebf958ff8e74cbf4081d06bf9bf0d9  7e8b6647f22c59b90d9e44fa575d525fa9bf2cef  feat(listener): update check asks GitHub first, falls back to GitLab
2026-11-08  228a184846a98ee93ff84e84db4f7fa41436a91b  595d32c2a5176d7083817e5221b696493b1beda8  chore(release): v0.5.0
2026-11-08  2d3ba0ced16a520b97e613845471a46e75130097  4f90925028fe525e4b395722f14cbcb2049180ea  feat(web): useTemperatureUnit preference hook
2026-11-08  3a515b2814afd0113d8579214fe0dfa85656d8b3  d3a864470d411d26d9856cf716b408e592cffac6  Merge branch 'feat/temperature-units'
2026-11-08  3eb491144a4d2d451e41dc9f81e2de5f27d02f23  ec58e3ad75233cb08e71cd043f2a85a59b8472ac  feat(web): show Timeline and device-page temperatures in the user's unit
2026-11-08  623314e4edd28f56c4378eb0e4e0741cc82f797e  25570954929ea73ac4ec614d0ba31fcc9855a4d2  fix: sensor-environment outer select carries characteristic; Celsius users keep exact thresholds on edit
2026-11-08  6fde5f695f5a3a6b8d8598314cb1e6aa58d889a6  6d21d1d48cdd29a302bdacf923db738f54371ace  feat(web): alert thresholds typed and shown in the user's temperature unit
2026-11-08  8bda6ce5d3986ffca0bdf175d69a9b763eb98e14  e50a7c203c12802c6d25424c8a4a15de81207f52  docs(guide): 0.5.0 upgrade notes, connection status, health fields, display names, macOS version refs
2026-11-08  96b00e8d6ae40231c95c6b9de11d787f20401017  61a62bedfeb1e5b5b7c38842f2fd5a46e1bd81ea  feat: Timeline export converts temperatures with unit=f
2026-11-08  9d0e97f23241bff843b030f5feba813e97d5a38f  b56aa2ed070198b142f4477d909f10dcc734e0bb  fix(listener): merge GitHub and GitLab releases instead of stopping at GitHub
2026-11-08  ade3a867078c0f8eedadf603402da0591fb60210  f45ac69df64ae0c7e0e4d464d2081fe1e0423857  feat(listener): temperature conversion and formatting helpers
2026-11-08  b74433ebf563e94bd0a478c833d4c72d6562799e  a68b5a2c444af813b3cd0cba47daf8b1bcc9bb9a  feat(listener): alert emails show temperatures in the rule owner's unit
2026-11-08  c910f544153ab79e10ef342301f6f9a909b81763  8f901f7a4cb8722ed8541cc7325e811693b8c4ae  feat(web): temperature unit control in Settings › Appearance
2026-11-08  d4697d6e2660d5ad9e1add93e3d0fd8ade0e17f1  13c330a60080eed0a23386fe9b62f6b40f2b787f  docs(spec): temperature unit (°C/°F) design
2026-11-08  ff07c6efe871edc9ad381c28681e40b3e72e7c3a  20995620d9fa82cfd464586171e1c86378680a01  feat: sensor panel, activity feed and toasts follow the temperature unit; fix Matter sensor scaling
```
