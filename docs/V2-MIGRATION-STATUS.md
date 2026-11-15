# Study1 V2 獨立移植狀態（2026-11-12，Asia/Taipei）

## 定位
- TASK_DOMAIN: Study1_E1_V2_CLONE
- SOURCE_REPO: `solactw-star/study1-recruitment-gas` PR #133
- SOURCE_HEAD: `c43401ac6453d9789aa96c8595c9a9edc8fff437`
- DEST_REPO: `solactw-star/study1-recruitment-e1-v1` (public, main)
- NEW_GAS_NAME: `Study 1 招募網站 (V2)`
- NEW_GAS_SCRIPT_ID: `1qg3PuI8sGFOAP-pJ889d9RrN0p_e0zsfqM274HgG4sEg9Qjv-xzqeL2f`
- ORIGINAL_GAS_SCRIPT_ID: `1hPERspy11hI56dJobIVgCElGNaWYJJTdrDh7CRlORTom9VHti2xyR93Z` (不得覆寫)

## 已核實的複製成果
- V2 GitHub main 初次提交：`10ef367ec35bdd0d52e7ed124fa5b12815a4e3da`
- V2 GitHub 完整移植提交：`b355b40ded79bbfdb5be80441cd62cf3b71fad99`
- GitHub main 完整回讀：154 檔；其中 `gas/` 33、`tests/` 77、`scripts/` 11（含新說明）、`docs/` 29（含新說明）。
- 與原 PR 指定來源 Git tree 逐檔比對：原 152 個非 workflow 檔案全部有對應；無漏檔。
- 僅 `README.md` 與 `gas/.clasp.json` 與來源不同（新 V2 說明及新 Script ID）。另新增兩份 V2 說明。
- 原 9 個 `.github/workflows/*` 刻意不移入；不會因 main push 自動同步或公開部署。
- 來源 ZIP 的本機 `npm test` 重跑：942 PASS / 0 FAIL / 0 SKIP。此為來源碼的本機測試，不是 V2 GAS 部署測試、CI 或 UAT。
- V2 實際修改 `.clasp.json` 後，原 `closed.test.cjs` 對舊 Script ID 的單一斷言已依 V2 新 Script ID 修正，重新在本機測試：942 PASS / 0 FAIL / 0 SKIP（2026-11-12）。V2 對應測試修正 commit：`8693c43f07733786442f4c3a1faaf8f1f9da525c`。
- 新 GAS 由原 GAS 複製建立，名稱與新 ID 由 Google Drive metadata 回讀，尚未對新 Script 的逐檔原始碼內容做 Apps Script API 驗證。

## 移植當時的尚未完成／阻塞（歷史快照；最新狀態見文末）
- `GAS_SYNC_VERIFIED=false`：目前連線沒有可直接操作 Google Apps Script content/update 與 deployment 的工具或已授權 V2 專用 OAuth 執行環境。
- 新 GAS 是原 GAS 的複製快照，不能視為已和 V2 GitHub PR #133 最後 commit 同步。
- 舊 `scripts/study1-gas-*.cjs` 的來源程式仍含舊系統 ID、網址或部署比對；作為移植參考留存，**不得直接對 V2 執行 apply/push/deploy**。需另行建置 V2 專用同步入口。
- 原 GAS UI 及真人收件、REC/PI 核准、個資／簽署 PDF／預約整合的實際 V2 UAT 未驗證。
- `FORMAL_READY=false`，`LIVE_INTAKE_ENABLED=false`。保持 `OPEN=false`、`CONSENT_READY=false`，不得接收真人個資。

## 移植當時的下一步（歷史快照）
1. 建立與授權 **只指向新 Script ID** 的 V2 專用同步工具（手動觸發；確認目標 ID、新舊環境隔離、完整前置備份及回讀）。
2. 用新工具把 V2 GitHub `gas/` 最終來源推送至新 GAS HEAD，逐檔 hash 驗證。
3. 僅建立私人 `MYSELF` 測試部署並實測必要後台／報名流程，不讀寫正式參與者個資。
4. REC、PI、時段、電子同意、個資、安全、部署與真實 UI 驗收皆完備並另獲正式啟用授權後，才可開放真人收件。

## WRITE_OWNER / SYNC_STATUS
- V2 GitHub: 已移植、完整性驗證通過
- V2 GAS: 僅副本建立完成，最新程式同步待驗
- Original GitHub/GAS: 本移植沒有修改其原始碼、部署或正式 Sheets
- Context: 本檔為 V2 的獨立進度，不替代原 GitHub 主規格、REC 或研究計畫


## 2026-11-12｜V2 HEAD-only 手動同步程式（獨立工程任務）

- TASK_DOMAIN: `Study1_E1_V2_HEAD_ONLY_SYNC`
- SOURCE_PATH: `.github/workflows/study1-v2-gas-head-only.yml`, `scripts/study1-v2-gas-head-only.cjs`, `tests/study1-v2-gas-head-only.test.cjs`
- TARGET_SCRIPT_ID: `1qg3PuI8sGFOAP-pJ889d9RrN0p_e0zsfqM274HgG4sEg9Qjv-xzqeL2f`（固定不可由 workflow 輸入覆蓋）
- 原 GAS 及正式個資／營運 Sheets 皆不在同步 API 呼叫範圍內。
- Workflow **僅支援 `workflow_dispatch`，僅 `main`，且要求使用者確認正確 40 字元 HEAD SHA**；不接受 `push`、`schedule`、外部 Repository。
- `audit`：GET V2 GAS HEAD，回報 `V2_AUDIT_REMOTE_SHA256`、遠端檔案數、GitHub 候選 SHA／檔案數，**不寫入遠端**。
- `apply`：需輸入同一最新 main 完整 SHA、上次 audit 的完整遠端 SHA-256 和字串 `I_AUTHORIZE_STUDY1_V2_HEAD_ONLY`；寫入前再次確認新 `main`、V2 Script ID、完整來源檔案清單、`MYSELF` Manifest 與關閉收件端點；保存 AES-256-GCM 加密的完整遠端寫入前備份至 Actions Artifact 並確認上傳後，才呼叫一次 `projects.content.update`。PUT 後重新讀取 **全部 32 個 GAS 原始檔** 並核對 SHA；讀回不明或失敗時不得自動重試／復原。
- `gas/Study1Unified.js` 正式 GAS 名稱為 `Study1Flow`，以避免和 `Study1Unified.html` 名稱衝突；`gas/.clasp.json` 僅供專案 ID 驗證，不會上傳。
- 未呼叫 GAS version/deployment API、原 GAS、Sheets API 或發送通知；GitHub Public 不會公開備份明文。
- 本機針對工作流、V2 原始檔案清單與關閉收件狀態的 **18 項測試：18 PASS／0 FAIL／0 SKIP**；與現場 GAS 或網頁 UAT 獨立。
- 最小一次性手動設定：在 **新 V2 Repo** 的 Actions secrets 增加 `V2_GAS_CLASPRC_JSON`（有效的 clasp OAuth JSON，含 refresh_token / client_id / client_secret），**最好來自僅獲 V2 GAS 編輯權限的專用帳號，不要複用可管理原 GAS／正式 Sheets 的研究室擁有者高權限憑證**。不能在聊天室張貼憑證。
- 現況：GitHub 同步程式已建立；**尚未確認該 secret 存在或實際呼叫 Google API**，因此 `GAS_SYNC_VERIFIED=false`、`GAS_DEPLOYED=false`、`UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。維持 `OPEN=false`、`CONSENT_READY=false`。
- NEXT_ACTION: 管理員完成 V2 專用 secret 後，先用 `audit` 取得真正遠端 SHA；確認後才可另行手動執行 `apply`。完成時需檢查遠端 SHA／檔案數與版本相符；此作業不授權公開部署或正式真人收件。


## 最新接續：2026-11-12｜V2 HEAD 已同步，私人部署盤點工具已建置

- TASK_DOMAIN: `Study1_E1_V2_PRIVATE_MYSELF_DEPLOY`
- V2 SOURCE_REPO: `solactw-star/study1-recruitment-e1-v1`、`main`（正式 SHA 請以本檔寫入後 GitHub main 回讀為準）。
- GAS Script ID: `1qg3PuI8sGFOAP-pJ889d9RrN0p_e0zsfqM274HgG4sEg9Qjv-xzqeL2f`；原 GAS ID 不在 V2 的部署程式中。
- **HEAD_SYNC_VERIFIED=true**：2026-11-12 14:29（台灣）手動 apply Run [43168509589](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43168509589) `completed/success`，實際 `V2_HEAD_ONLY_SYNC_VERIFIED=true`、`V2_HEAD_FILE_COUNT=32`、GAS HEAD 完整 SHA-256=`73dea801154abbe847863a07df2e623fc1d68622a4442f006d1be7473dd5a0f7`，與受審來源一致；加密寫前備份 Artifact ID `13921211668`（7 天到期），`V2_DEPLOYMENT_MUTATIONS=0`。
- **PRIVATE_DEPLOY_TOOL_MAIN_SYNC_VERIFIED=true**：新增專用 `scripts/study1-v2-private-deploy.cjs`、`tests/study1-v2-private-deploy.test.cjs`、`.github/workflows/study1-v2-private-deploy.yml`；現有 HEAD-only workflow 不變。私人部署流程僅 `workflow_dispatch`，先 `audit` 透過新 GAS 的 Apps Script API 唯讀盤點版本、部署、既有版 Manifest／ACL 及 SHA。核對後 `deploy` 必須輸入前次 audit 的完整 `V2_PRIVATE_INVENTORY_SHA256` 與獨立確認字串 `I_AUTHORIZE_STUDY1_V2_PRIVATE_MYSELF_DEPLOY`。實際遠端寫入範圍只允許 V2 `POST /versions` 建立一份不可變版本與 V2 `POST /deployments` 新增一個 `MYSELF` 私人部署，寫後 GET 版號、不可變內容 SHA、部署 ID／ACL、清單增量及原有部署未變；不 GET/PUT 原 GAS 或兩份正式 Sheets、不更新 V2 GAS HEAD、不執行 GAS 函式、不寄信、不啟用真人收件。
- **PRIVATE_DEPLOY_SAFETY_CI_VERIFIED=true**：唯一新增的 CI-only workflow `.github/workflows/study1-v2-private-deploy-tests.yml` 在 Push Run [43170050358](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43170050358) 完成 `29 PASS / 0 FAIL / 0 SKIP`。此 CI 無 Secret、不打 Google API；日誌中 `V2_PRIVATE_DEPLOY_VERIFIED` 是 **mock 合成測試輸出，不是真實 GAS 部署證據**。
- **REMOTE_VERSION_INVENTORY_VERIFIED=false / REMOTE_DEPLOYMENT_INVENTORY_VERIFIED=false**：目前可用 GitHub connector 只有 Actions GET/日誌及 Git 程式碼寫入，沒有 `workflow_dispatch` 操作工具或連接到 V2 憑證的 Apps Script API，因此尚未執行新 `audit`；不得虛構新 GAS 的版本數、部署數、部署 URL 或實際 ACL。
- **GAS_PRIVATE_DEPLOYED=false / UI_VERIFIED=false / FORMAL_READY=false / LIVE_INTAKE_ENABLED=false**：使用者已授權私人測試部署，但此輪截至寫入時尚未實際觸發部署。V2 `OPEN=false`、`CONSENT_READY=false`、`MYSELF`、實驗二不招募。
- NEXT_ACTION: 執行 [V2 私人部署 workflow](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/workflows/study1-v2-private-deploy.yml) 的 **audit**（`reviewed_sha` 為執行時最新 V2 main SHA，其餘欄位空白），取得真實版本數、部署數、`V2_PRIVATE_INVENTORY_SHA256` 與全部 ACL 查核；回讀日誌確認安全後，再以 **deploy**、同一最新版 main SHA、實際 audit 指紋與確認字串執行；部署成功後必須回讀版本與新私人 /exec，最後進行有權部署者的真實 UI UAT。任何不一致停止，不改原系統。
- WRITE_OWNER: V2 GitHub 主檔維護；Google Apps Script 只在人工啟動且通過全部安全門檻後操作新 Script ID。
- SYNC_STATUS: `HEAD_SYNC_VERIFIED=true`；`PRIVATE_DEPLOY_TOOL_MAIN_SYNC_VERIFIED=true`；`REMOTE_DEPLOYMENT_INVENTORY_VERIFIED=false`；`GAS_PRIVATE_DEPLOYED=false`；`CONTEXT_SYNC_STATUS=V2專責文件已更新`。


## 2026-11-12｜PRIVATE MYSELF audit 的 HEAD 版本解析修復（V2 main）

- TASK_DOMAIN: `Study1_E1_V2_PRIVATE_INVENTORY_AUDIT_FIX`
- ROOT_CAUSE_EVIDENCE: 手動 audit Run [43171667210](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43171667210)，29 項原安全測試及 manual/main/SHA 守門通過，但 Google Apps Script API 實際傳回的部署清單觸發 `V2_PRIVATE_BLOCKED: unexpected deployment version`；並非新 GAS HEAD 同步失敗。
- OFFICIAL_REFERENCE: Google Apps Script 官方「Create and manage deployments」與「REST Resource projects.deployments」；系統有一個 HEAD 開發部署，而版本化部署有整數版號。原程式錯以部署 ID 必須逐字等於 `HEAD` 才接受未提供或零版號。
- MAIN_SOURCE_PATCH: `scripts/study1-v2-private-deploy.cjs`，commit `2c3f48535eb6af24c4720b8c5319d78b226b9792`。現在 `versionNumber` 缺漏或數值 0 歸類為 HEAD，正整數歸類 VERSIONED，不依 ID 字面判定；**最多只允許一筆 HEAD**，其他型別、重複、非 V2 Script ID、Manifest 不符、公開 WebApp ACL、`executeAs` 錯誤及 HEAD 32 檔完整 SHA 不符仍 fail closed。
- MINIMAL_REDACTED_DIAGNOSTIC: `V2_PRIVATE_DEPLOY_VERSION_SHAPES_JSON` 只輸出索引、版本欄位形態、manifest 欄位是否存在與 ACL 枚舉，不輸出原始部署 ID、WebApp URL 或 Secret。只有實際執行私人 audit 才能產生遠端清單與 `V2_PRIVATE_INVENTORY_SHA256`。
- TEST_PATCH: `tests/study1-v2-private-deploy.test.cjs` 新增缺失版號、0 版號、非字面 HEAD ID、最多一筆 HEAD、公開或錯誤執行身分阻擋、只讀 audit 無 mutations 等回歸案例；完成修正測試斷言後 commit `d3499fbfb87fb97ab173cdd25064e6087253fff3`。
- CI_VERIFIED: [Run 43178332563](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43178332563)，`completed/success`，`32 PASS / 0 FAIL / 0 SKIP`，GitHub CI-only 工作流程不帶 V2 OAuth Secret，也沒有對 GAS／Sheets 的 API 呼叫。先前 Run 43178231574 因測試把原始 API 物件誤認成正規化結果而 31/32 未過，已修正並由成功 Run 取代。
- NO_REMOTE_WRITE: 此次只修改 **V2 GitHub main 的程式／測試／同一路徑進度檔**；沒有執行實際 `audit`、`deploy`、GAS HEAD 更新、原 GAS／正式 Sheets 寫入、正式收件。
- STATUS: `GAS_SYNC_VERIFIED=true`（前次 32 檔 SHA `73dea801154abbe847863a07df2e623fc1d68622a4442f006d1be7473dd5a0f7`）；`PRIVATE_AUDIT_PARSER_CI_VERIFIED=true`；`REMOTE_DEPLOYMENT_INVENTORY_VERIFIED=false`；`GAS_PRIVATE_DEPLOYED=false`；`UI_VERIFIED=false`；`FORMAL_READY=false`；`LIVE_INTAKE_ENABLED=false`。
- NEXT_ACTION: 以當下最新 V2 main 完整 commit SHA 重新手動執行 `.github/workflows/study1-v2-private-deploy.yml` 的 `mode=audit`；回讀真實版本／部署數、HEAD 32 檔 SHA、`MYSELF`、`USER_DEPLOYING` 與盤點指紋。audit 未通過前**不得執行 deploy**，也不得修改原系統或真人收件狀態。


## 2026-11-12｜V2 PRIVATE MYSELF 唯讀 GET 429／503 有限退避修復

- TASK_DOMAIN: `Study1_E1_V2_PRIVATE_AUDIT_GET_RETRY_FIX`
- FAILURE_SOURCE: 手動唯讀 audit [Run 43179403869](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43179403869) 於 V2 `GET /deployments` 收到 HTTP 503，未成功產生遠端部署清單或 `V2_PRIVATE_INVENTORY_SHA256`；這不是正式部署成功或失敗的證據。
- CODE: 同原路徑增量修改 `scripts/study1-v2-private-deploy.cjs`，commit `ff38c27eea74afb09906b9a59eb93636dbf95db9`。僅對 V2 Apps Script API 的 **GET** 429／503 最多 **3 次請求（含初次）**，以指數退避加有限 jitter 重試：503 約 1s、2s；429 約 30s、60s；耗盡則 fail closed。401、403、其他 HTTP 錯誤與網路例外不重試。OAuth refresh POST、`POST /versions`、`POST /deployments` 皆維持單次，沒有自動重試、回滾或重複建立。
- DIAGNOSTIC: `V2_PRIVATE_GET_RETRY_HTTP_STATUS` 僅記錄狀態碼、白名單化路徑、重試次數與退避毫秒，不記錄 token、頁面游標、部署 ID／網址、完整 Google 錯誤本文或正式研究資料。
- TEST: 同原路徑更新 `tests/study1-v2-private-deploy.test.cjs`，commit `c0de7b68d625e51086b60e1abc62eb2cce2fc038`；補齊 GET 503 成功重試、429 遲滯與三次截止、401／403／404 與網路例外拒絕重試，以及 POST 版本／部署在 503／429 時僅一次的回歸測試。
- CI: [Run 43179932558](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43179932558)，`completed/success`，**36 PASS / 0 FAIL / 0 SKIP**；此 CI 無 OAuth Secret，不呼叫實際 GAS 或 Sheets。可證明測試與靜態守門通過，但不等於遠端 API 已恢復。
- SAFETY: V2 Script ID `1qg3PuI8sGFOAP-pJ889d9RrN0p_e0zsfqM274HgG4sEg9Qjv-xzqeL2f` 固定；先前核實 GAS HEAD SHA-256 `73dea801154abbe847863a07df2e623fc1d68622a4442f006d1be7473dd5a0f7` 的 32 檔配置、`MYSELF`／`USER_DEPLOYING`、收件關閉檢查不變。此輪只寫 V2 GitHub 程式／測試／本進度檔；不執行遠端 audit、deploy，不碰原 GAS／正式 Sheets，不開放真人收件。
- NEXT_ACTION: 手動用**執行當下最新 main SHA** 觸發 `.github/workflows/study1-v2-private-deploy.yml` 的 `mode=audit`（另外兩欄留空），回讀真實遠端版本／部署、MYSELF、HEAD 32 檔 SHA 及 `V2_PRIVATE_INVENTORY_SHA256`；任何 503 重試耗盡或不安全 ACL 均保留阻塞，不能逕行 deploy。
- SYNC_STATUS: `MAIN_SYNC_VERIFIED=true`（本檔寫回後以最新 main 回讀為準），`GET_RETRY_CI_VERIFIED=true`，`REMOTE_DEPLOYMENT_INVENTORY_VERIFIED=false`，`GAS_PRIVATE_DEPLOYED=false`，`UI_VERIFIED=false`，`FORMAL_READY=false`，`LIVE_INTAKE_ENABLED=false`。

## 2026-11-12 18:48（Asia/Taipei）｜真實 PRIVATE audit 成功、孤立版本接續修復

- TASK_DOMAIN: `Study1_E1_V2_PRIVATE_MYSELF_DEPLOY`
- LATEST_REAL_AUDIT: [Run 43201314393](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43201314393), `workflow_dispatch`, `mode=audit`, GitHub HEAD `9d6bc139e47818f3fddc1e168f504b54bb57f0e9`, completed/success；三項回讀資料 HTTP 503 經 GET-only 有限重試成功，36/36 靜態與合成測試通過。
- REMOTE_HEAD: 32 個 GAS 檔案；SHA-256 `73dea801154abbe847863a07df2e623fc1d68622a4442f006d1be7473dd5a0f7`，與既有已核對 GAS HEAD／V2 原始碼相符。Manifest `MYSELF`、`USER_DEPLOYING`、收件關閉；`V2_PRIVATE_AUDIT_NO_MUTATIONS=true`。
- REMOTE_INVENTORY: 1 個不可變版本、1 個自動 HEAD 開發部署、0 個版本化部署；`V2_PRIVATE_INVENTORY_SHA256=63f34f5609ad81321debc352b62fa41e2a0bf3ef422dc58bab5d2cc9ccf94d06`。audit 沒有產生 Artifact（0），符合唯讀盤點預期。
- EARLIER_DEPLOY_FAILURE: [Run 43182160131](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43182160131) 於 `version inventory did not gain exactly one immutable version` 阻擋在部署 POST 之前。後續 audit 顯示已有版本 1，與前次成功建立版本但立即 GET 清單尚未可見相符；**該版本的來源描述及完整內容仍必須在下一次 `deploy` 中獨立驗證，不得只憑版本號接續**。
- REMEDIATION_CODE: 同原路徑 `scripts/study1-v2-private-deploy.cjs`，增加 5 輪上限的 GET-only 版本／部署回讀（不重試 POST）；僅能重用符合 `9d6bc139e47818f3fddc1e168f504b54bb57f0e9` 或當次主分支 SHA、來源 HEAD 標記與數字 Run ID 的**唯一未部署版本**，重用前透過 `getVersionContent` 驗證固定 32 檔 SHA、私人 ACL 與收件關閉；歧義或競寫 fail closed。新日誌不再輸出完整部署 ID。
- REMEDIATION_TEST: `tests/study1-v2-private-deploy.test.cjs` 補強孤立版本恢復、讀回延遲、重複 POST 避免及多版本歧義。修正後 [CI Run 43203568042](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43203568042)，commit `7511a4ae2a526f84a2e55e49db07ad851bf5148e`，`40 PASS / 0 FAIL`。歷史兩次中間修補 CI 語法失敗已由此最新成功 Run 取代。
- REPOSITORY_VISIBILITY_REVIEW: GitHub `get_repo` 回報 V2 `visibility=public`；與先前「私人 V2 副本」的目標不一致。GitHub `package.json.private=true` **不等於** GitHub Repository 私有；需由管理者於 Repository Settings 核對並調整 GitHub 可見性，另核查先前公開 Actions 日誌的部署識別資訊。未見證據可宣稱 OAuth 憑證外洩，不應作此推定。
- STATUS: `V2_HEAD_SYNC_VERIFIED=true`（沿用且由當次真實 HEAD 核對支持）、`V2_REMOTE_INVENTORY_AUDIT_VERIFIED=true`（截至 Run 43201314393）、`PRIVATE_DEPLOY_CODE_CI_VERIFIED=true`（40/40）、`GAS_PRIVATE_DEPLOYED=false`、`UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。
- NEXT_ACTION: 由 V2 管理者用當下最新 `main` SHA 再執行 `.github/workflows/study1-v2-private-deploy.yml` 的 `mode=audit`（其餘 deploy 專用欄位空白），取得**新**盤點指紋，逐項核對版本內容、ACL、現有部署數；再手動 `mode=deploy` 填新 SHA、核對過的盤點指紋、`I_AUTHORIZE_STUDY1_V2_PRIVATE_MYSELF_DEPLOY`。若 `V2_PRIVATE_REUSED_VERIFIED_ORPHAN_VERSION=true` 且 `V2_PRIVATE_DEPLOY_VERIFIED=true`，須獨立回讀並在 GAS UI 確認私人部署後，執行必要後台／報名頁實際 UAT。整段仍不開啟真人收件、不同步原 GAS 或正式 Sheets。
- WRITE_OWNER: V2 GitHub；本次只修改 V2 專用部署程式、測試及 V2 進度主檔，無 GAS、Sheet 或 REC 修改。文件的正式 GitHub `main` SHA 以寫入後回讀為準。

## 2026-11-12 19:03（Asia/Taipei）｜最新成功私人部署唯讀 Audit（Run #43205689864）

- TASK_DOMAIN: `Study1_E1_V2_PRIVATE_DEPLOY_AUDIT_READBACK`。
- SOURCE_REPO: `solactw-star/study1-recruitment-e1-v1`；SOURCE_PATH: `.github/workflows/study1-v2-private-deploy.yml`、`scripts/study1-v2-private-deploy.cjs`；進度寫入：`docs/V2-MIGRATION-STATUS.md`（原路徑）。
- VERIFIED_RUN: [Run #43205689864](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43205689864)，`workflow_dispatch`、`mode=audit`、`completed/success`，2026-11-12 19:02:50–19:03:05（台灣）；Job `private-preview` ID `131140151323` 所有步驟成功，40 PASS / 0 FAIL / 0 SKIP。受審 GitHub main SHA `fc01552007c1c80ffc1da29c8f85ef585d924029`，與本輪文件更新前 main 一致。
- GAS_V2_TARGET: 新獨立 Script ID `1qg3PuI8sGFOAP-pJ889d9RrN0p_e0zsfqM274HgG4sEg9Qjv-xzqeL2f`；原 GAS 不屬本次查核或寫入目標。
- VERIFIED_REMOTE_HEAD: `V2_PRIVATE_HEAD_FILE_COUNT=32`；`V2_PRIVATE_HEAD_SHA256=73dea801154abbe847863a07df2e623fc1d68622a4442f006d1be7473dd5a0f7`，與前次已核對的 HEAD 指紋一致。
- VERIFIED_REMOTE_INVENTORY: `V2_PRIVATE_VERSION_NUMBERS=1`、`V2_PRIVATE_VERSION_COUNT=1`、`V2_PRIVATE_DEPLOYMENT_COUNT=2`、`V2_PRIVATE_VERSIONED_DEPLOYMENT_COUNT=1`。部署清單有原 HEAD（`version=null`）及新版本化部署（`version=1`），兩筆的 Web App `access=MYSELF`、`executeAs=USER_DEPLOYING`；`V2_PRIVATE_MANIFEST_MYSELF=true`、`V2_PRIVATE_INTAKE_CLOSED=true`、`V2_PRIVATE_AUDIT_NO_MUTATIONS=true`。
- INVENTORY_FINGERPRINT: 最新 `V2_PRIVATE_INVENTORY_SHA256=465f30b3d7fb525f2897cc5fb53eb6d85bcedf1f41b56a739abc08e418633d8b`。與部署前指紋 `63f34f5609ad81321debc352b62fa41e2a0bf3ef422dc58bab5d2cc9ccf94d06` 不同，符合新增版本化部署的盤點變化。
- PARTIAL_DEPLOY_RECOVERY: 先前 [Run #43204950488](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43204950488) 為 `mode=deploy`，日誌顯示 `V2_PRIVATE_REUSED_VERIFIED_ORPHAN_VERSION=true`，隨後在建立部署回應後的單筆 `GET /deployments/:id` 遇到 HTTP 404，整個 Run 標記 failure；本次**後續獨立唯讀 Audit 已核實**新版本 1 部署存在，故不得因前次 Run failure 推論未建立部署，亦不得重送部署 POST。
- PENDING_DETAIL_READBACK: 雖然原 HEAD 仍存在且目前版本形態／ACL 相符，但**原 HEAD deploymentId、updateTime、entryPoints URL 等逐欄未變比對尚未驗證**；新版本化部署的 deploymentId、updateTime 與實際私人 `/exec` URL 未由現有遮蔽日誌取得。此項需具權限的 GAS 管理畫面或 Apps Script deployments 唯讀 API 驗證；不得臆造網址。
- PENDING_UI_UAT: **`UI_VERIFIED=false`**。尚未在指定 V2 私人部署版本實際操作驗收招募資訊、必要後台、報名關閉、預約及 PDF 流程；40/40 是測試，不替代真人 UI 驗收。
- SECURITY_AND_INTAKE: GAS 的 `MYSELF`／`USER_DEPLOYING` 和關閉收件程式判定不等同正式 REC／PI／個資安全或公開上線核准；`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`，保持 `OPEN=false`、`CONSENT_READY=false`。V2 GitHub Repository 曾經核實為 public；公開可見性議題與私人 GAS ACL 分開追蹤，尚未標記處理完成。
- VERIFIED_STATUS: `MAIN_SOURCE_AT_AUDIT=fc01552007c1c80ffc1da29c8f85ef585d924029`；`HEAD_SYNC_VERIFIED=true`；`PRIVATE_DEPLOYMENT_EXISTS=true`（由唯讀 Audit 證實）；`PRIVATE_ACL_VERIFIED=true`；`ORIGINAL_DEPLOYMENT_UNCHANGED_VERIFIED=false`（詳細欄位不足）；`NEW_PRIVATE_EXEC_URL_VERIFIED=false`；`UI_VERIFIED=false`；`FORMAL_READY=false`；`LIVE_INTAKE_ENABLED=false`。上方歷史快照中的 `GAS_PRIVATE_DEPLOYED=false` 是**先前狀態**，本節為較新的存在性查核，但仍不可視為全部部署驗收通過。
- NEXT_ACTION: **不要再次執行 `deploy`**。僅以唯讀方式取得原 HEAD 與新版本化部署的 deploymentId、updateTime、ACL／entryPoints、經驗證私人 `/exec` URL，對照原 HEAD 歷史紀錄並核實未變；其後完成指定版本真實 UI UAT。若要正式開放真人收件，另依 REC、PI、個資安全與正式啟用授權處理。
- WRITE_SCOPE: 本次僅增量寫回 V2 同一 `docs/V2-MIGRATION-STATUS.md`；不修改 V2 GAS HEAD／部署、原 GAS、正式 Sheets、REC、其他 GitHub 程式或工作流程。最終 `MAIN_SYNC_VERIFIED` 以寫後 main commit、檔案全文與 commit 變更清單回讀為準。

## 2026-11-12｜V2 站內導覽增量修復（GitHub only；最小 UI smoke 標準）

- TASK_DOMAIN: `Study1_E1_V2_NAVIGATION_CONTINUE_BUILD`；PRE_MAIN_SHA: `6583b9a7acbd1a3e63dac9b9f4aaafffdafde75f`。
- DECISION: 使用者要求停止重複完整部署稽核；僅檢查 V2 私人部署可開啟、顯示正確研究首頁且收件仍關閉後，繼續建置網站。這不取代 REC／PI／正式真人收件核准。
- SOURCE_FINDING: V2 `gas/Index.html`「查看正式報名流程」及 `gas/Study1Visitor.html`「研究資訊首頁」原本硬連到**原 GAS 公開網站**，不屬 V2 私人部署。
- CODE_CHANGE: 僅 V2 `gas/Website.js` 提供 `study1V2SelfWebUrl_()`，依 V2 Script ID 限定從 GAS `ScriptApp.getService().getUrl()` 取得目前執行中的 Web App URL；`Index.html`、`Study1Visitor.html` 改由 HTML template 載入同站連結，不把私人部署 ID 寫入 GitHub；若網址無法取得或格式不符，連結退回本頁錨點而非跳到原站。對應兩個既有關閉網站測試更新為檢查動態路由及禁止原 GAS 舊連結。
- VERIFIED_LIMIT: 這次只修改 V2 GitHub 原有檔案；已確認的 **GAS 版本 1 是不可變快照，並不會因 GitHub 更新而自動改變**。未獲 GAS HEAD 同步、更新版本及指定私人部署的後續授權／驗證之前，不能宣稱修復已顯示在版本 1 網站。
- MINIMUM_UI_SMOKE: 由持有 MYSELF 權限的 OWNER 開啟使用者提供的新 V2 版本 1 `/exec`，確認研究招募首頁可見、頁面身分正確與「目前尚未開放報名」；新程式部署後另確認報名連結不離開 V2。無實際有權瀏覽器畫面證據，`UI_VERIFIED=false`。
- SECURITY: `OPEN=false`、`CONSENT_READY=false`、`MYSELF`、`USER_DEPLOYING`；不寄送 OTP、不建立申請、不預約、不簽署 PDF、不修改原 GAS、正式 Sheets、REC；E2 維持關閉。
- WRITE_OWNER: V2 GitHub main（僅網站首頁、FORMAL 頁與關閉檢查測試、本進度檔）。`MAIN_SYNC_VERIFIED` 由此次 commit SHA、檔案差異與回讀確認；`GAS_SOURCE_SYNC_NEW_CODE=false`、`NEW_VERSION_DEPLOYED=false`、`UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。
- NEXT_ACTION: 不再追逐冗長部署核驗；優先完成 V2 E1 五項 MVP 必要流程，待獲獨立部署授權後以最小安全同步／版本更新及真實頁面 smoke 確認，仍不開放真人收件。

## 2026-11-12｜V2 登入 Google 帳號公開唯讀版程式準備（尚未部署）

- TASK_DOMAIN=`Study1_V2_LOGIN_ONLY_PUBLIC_BROWSE`；PRE_MAIN_SHA=`2640405a1868998a35a550b289d576417a4ae88d`。使用者核准 `ANYONE`（非匿名）、`USER_DEPLOYING`，保留既有私人 V1 `MYSELF`、原 GAS 與正式 Sheets 不變。
- V2 `gas/appsscript.json` 設為登入後公開；`Website.js` 以伺服器端直接阻擋 `admin/team/preview/demo` 路由及私人 RPC；其他 GAS JS 對外函式全部加上公開唯讀拒絕入口；E1 Readiness 固定 `ready=false`；不寄信、不儲存真人資料、不預約、不讀取/簽署 PDF。
- V2 HEAD-only 安全守門新增 `ANYONE` 模式的 RPC 逐函式保護核對；新增 `tests/study1-v2-public-readonly.test.cjs` 與純離線 GitHub CI。正式主規格增量更新原 `docs/study1-system-spec.md` §70-S.34。
- 下一步：核對 V2 main CI，使用原 V2 HEAD-only 安全來源備份/同步，再建立新版本化登入後公開部署。若無適用工具或安全回讀，`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`，不可聲稱公開已完成。
- 最小 UI smoke：非 OWNER 已登入 Google 帳號能顯示正確招募首頁，FORMAL 頁關閉報名，後台及私人 RPC 被拒絕。未驗收 `PUBLIC_UI_VERIFIED=false`。
- 未修改 V2 私人版本 1、原 GAS／原網站、正式 Sheets、REC 或真人研究資料。維持 `OPEN=false`、`CONSENT_READY=false`、E2 關閉、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。

### 2026-11-12 20:35（台灣）｜V2 Google 登入後唯讀公開版安全 CI 已通過

- SOURCE_MAIN_SHA=`bb5e0eb8d413fe01be2ce95fc3304d0c2d43a555`；GitHub Actions [Run #43219267081](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43219267081) `completed/success`；Job `public-safety` ID `131186311202`，**22 PASS／0 FAIL／0 SKIP**，涵蓋 32 GAS 來源、53 個拒絕閘門、Google 登入 ACL、關閉報名、公開頁及後台路由、既有 HEAD-only 安全守門與語法。
- GitHub SOURCE_READY_FOR_REMOTE_SYNC=true（限 V2 唯讀公開版程式和離線測試）；這項結果**不代表** GAS HEAD 已同步或 ANYONE 部署已建立。
- REMOTE_GAS_HEAD_SYNC=NOT_RUN；PUBLIC_VERSION=NOT_CREATED；PUBLIC_DEPLOYED=false；PUBLIC_UI_VERIFIED=false；FORMAL_READY=false；LIVE_INTAKE_ENABLED=false。
- DEPLOYMENT_NEXT: 研究室所有者使用既有 V2 同 Script ID 的 `study1-v2-gas-head-only.yml` 原 workflow（先 mode=audit 取得單次遠端 HEAD SHA，再 mode=apply 進行備份、競寫確認與唯一 PUT），回讀新版 HEAD 及登入後公開 `ANYONE` manifest；再於同 V2 GAS 專案建立新不可變版本與獨立 `ANYONE/USER_DEPLOYING` Web App 部署。不可重用 MYSELF 私人版號 1、覆蓋舊私人部署或手工拼湊部署 URL。
- 最小 UI smoke：持有一般 Google 帳號但非 OWNER 的瀏覽器開啟**新公開部署**，檢查首頁確為 Study1、FORMAL 報名關閉及 OWNER 路由被拒絕。尚無實際新公開網址及畫面證據，保持 BLOCKED，不填實測 PASS。

## 2026-11-12｜帳號授權與 UI UAT 暫停，直接接續 E1 網站程式

- TASK_DOMAIN=`Study1_V2_E1_WEB_CONTINUATION_NO_OAUTH`；SOURCE_REPO=`solactw-star/study1-recruitment-e1-v1`；PRE_MAIN_SHA=`8e334d9bf51ed0ac163a5d6c09b97cb5b147c1d0`。
- USER_DECISION: 本輪明確要求**不等待 Google 帳號授權、實際 UI UAT 或 GAS 部署**，先直接完成可以離線編輯／測試的網站程式。原公開登入後唯讀之 `ANYONE/USER_DEPLOYING` 產品目標維持不變，但真人報名與電子同意仍不得啟用。
- FORMAL_UI_INCREMENT: 原 `gas/Study1Visitor.html` 的正式頁標題改為「報名資訊（目前不收件）」，加強第一屏資訊狀態；正式七階段控制器在尚未取得 readiness、回應 `ready=false`、取得失敗或 Google RPC 不可用時均顯示明確報名關閉訊息。絕不因連線失敗打開 E1/E2、姓名欄、OTP、時段或簽署。
- OFFLINE_REGRESSION: 更新既有 `tests/study1-formal-browser-synthetic-e2e.test.cjs`，新增關閉訊息／讀取失敗無 PII／無 CAPTCHA 負測；沿用原 `.github/workflows/study1-v2-public-readonly-ci.yml` 自動納入測試，不建立平行正式網站或替代原 V05/V08 核心。
- USER_STATED_BLOCKERS: `GOOGLE_ACCOUNT_AUTHORIZATION_BLOCKED=true`、`PUBLIC_UI_VERIFIED=false`。不以 CI 代表真實瀏覽器驗收；本輪 `GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。
- NEXT_ACTION: 繼續從 E1 五項 MVP 的必要已存在程式檔修正、測試與 GitHub 增量回讀；公開唯讀安全邊界、原 V2 私人版本 1、原 GAS、正式 Sheets、REC 均不更動；待帳號權限可用再一次完成最小必要部署／三項 smoke。

### 2026-11-12 21:20（台灣）｜無帳號授權狀態下繼續 FORMAL 網站建置，27 項離線驗收通過

- TASK_DOMAIN=`Study1_V2_E1_WEB_CONTINUATION_NO_OAUTH`；LAST_VERIFIED_STEP=FORMAL_CLOSED_BANNER_AND_OFFLINE_AUTH_FAILURE_REGRESSION；LAST_CODE_MAIN_SHA=`168eb53fd018943f54220b1dedce18f7b235df6f`。
- 受影響 V2 程式：原 `gas/Study1Visitor.html`。FORMAL 頁標題改顯示「報名資訊（目前不收件）」；首次讀取 readiness 期間顯示「未核實前不接受正式申請」。明確 `ready=false`、GAS RPC 例外、或完全沒有 Google RPC 時，維持 E1／E2 按鈕、姓名／Email／電話及資格選項不可使用；同步顯示不蒐集資料、不寄驗證碼、不預約的提示，避免只顯示模糊連線中或錯誤成功訊息。
- 受影響既有測試：`tests/study1-formal-browser-synthetic-e2e.test.cjs`，新增 / 擴充失敗模式，並由既有 `.github/workflows/study1-v2-public-readonly-ci.yml` 在 `gas/` 程式變動時自動執行；不重做已驗證 V05/V08 核心、不中途啟用真人流程。
- CI_VERIFIED： [GitHub Actions Run #43226367365](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43226367365)，source SHA `168eb53fd018943f54220b1dedce18f7b235df6f`，Job `public-safety` ID `131210472300`；實際 Job 日誌 `27 PASS / 0 FAIL / 0 SKIP`（含無 Google RPC、readiness 失敗與 E1 關閉 UI 回歸）。
- AUTH_BLOCKER：使用者回報目前無法完成 Google 帳號授權。僅阻礙遠端私人／公開網站實際檢查；不阻擋 V2 GitHub 可離線建置與測試。不得將上述合成驗證標為瀏覽器 UAT 成功。
- SYNC_STATUS：程式先前已提交 main；本輪更新同一進度主檔並回讀 commit／變更清單。不執行 GAS HEAD PUT、不建立或更新版本／部署、不修改私人版本 1／原 GAS／正式 Sheets／REC；`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。
- NEXT_ACTION：接續 E1 五項 MVP 中尚需程式完善的報名、OTP、時段預約、研究者預簽 PDF 與 OWNER 後台、Email 通知，以現有正式主規格為準做離線增量實作與必要測試，不以 Google 授權為工程工作前置阻塞；正式收件仍關閉。

## 2026-11-12｜E1 FORMAL 自陳報名／Email OTP 錯誤處理增量（GitHub only）

- TASK_DOMAIN=`Study1_V2_E1_FORMAL_SELF_REPORT_EMAIL_OTP`；PRE_MAIN_SHA=`deb6bd8a2268a9f1993600f4ad0d27ca92153020`；依正式主規格 §70-S.18、§70-S.24、§70-S.34 接續，保留既有真實 Applicants／Screenings／Verification 安全邊界，不加入 Demo、證件核身或假資料。
- 修改 V2 原 `gas/Study1Visitor.html`：五項自陳若未全選只顯示不符資格、未送出個資；姓名/Email/電話格式先在本機檢查，避免無效申請送至後端；後端不明拒絕不冒充資格不符，原申請識別不正確時 fail closed。
- E1 Email OTP：每次頁面會話的核發 requestId 僅建立一次；寄送開始即停用再寄按鈕，不因回覆遺失、節流或 `ALREADY_ISSUED` 自動重送；區別 `ISSUED`、`THROTTLED`、`ALREADY_ISSUED` 和未知結果，不把核發／寄件要求當成信件送達；僅有效 challenge ID 可顯示輸入框，八位碼格式在送出前驗證。
- 對應既有 `tests/study1-formal-browser-synthetic-e2e.test.cjs` 增量加入離線負測；沿用原 V2 public-readonly CI 自動偵測 `gas/` 更新。沒有變更 server OTP HMAC／MailApp／Sheets／預約或正式簽署核心，也沒有將公開版 RPC 封鎖打開。
- 本次 `GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。Google 授權不影響 GitHub 離線建置，但實機 UAT 仍待授權可用時執行。

### 2026-11-12 21:27（Asia/Taipei）｜E1 FORMAL／OTP 離線測試與變更範圍已回讀

- CODE_COMMIT_SHA=`80f63fbeea294305d786df59425d05540212d45f`（其直接父提交 `deb6bd8a2268a9f1993600f4ad0d27ca92153020`）；該 commit 經 GitHub REST 回讀只改 `gas/Study1Visitor.html`、`tests/study1-formal-browser-synthetic-e2e.test.cjs`、原 `docs/V2-MIGRATION-STATUS.md`，沒有動 GAS 服務端 OTP、公開 ACL 或正式資料來源。
- CI_VERIFIED= [GitHub Actions Run #43227447901](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43227447901)；Job `public-safety` ID `131214184370`；Job 實際日誌 `34 PASS / 0 FAIL / 0 SKIP`，含新增七項 E1 自陳／申請／Email OTP 負向測試與既有公開唯讀安全測試。
- HEAD_CODE_READBACK=PASS；FORMAL 頁改用單一 OTP 核發請求識別、節流與未確認寄件結果不冒稱已送達、自陳不符不送出個資、格式不符不呼叫後端。公開版遠端 `ANYONE` 不開放申請／寄信／預約／PDF 的原安全閘門仍未修改。
- SYNC_STATUS=`MAIN_CODE_CI_VERIFIED=true`、`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。Google 授權阻塞尚未解除，不阻礙離線建置；不得將離線 CI 判為真人營運成功。
- NEXT_ACTION：繼續既有 E1 五項 MVP 必要後端與 UI 程式整合，尤其 OTP 結果通知、原時段預約與最後 PDF 研究者預簽／參與者簽署之閉環；維持原 GAS、正式 Sheets、REC 不動。


## 2026-11-12｜E1 Email OTP 唯讀因果回查與一次性驗證前後端整合（GitHub-only）
- TASK_DOMAIN=`Study1_V2_E1_OTP_UNKNOWN_RECOVERY`；PRE_MAIN_SHA=`5830d6f882c37d3c40368aafee3175506838fa4b`；遵循原唯一主規格 §70-S.16–18、§70-S.24、§70-S.34；程式更新不等於真人收件核准。
- 後端 `gas/Study1ParticipantIntake.js`：沿用原 Verification A:I／F:G、共同 ScriptLock、原 HMAC，新增 `study1ParticipantOtpIssueState_` 唯讀核查同一高熵 requestId 的持久 OTP 挑戰，明確區分 `NOT_FOUND/PENDING/USED/EXPIRED/LOCKED/SUPERSEDED`，不從存在性推定 MailApp 送達；加入原公開入口 `study1ParticipantOtpIssueState`，在 V2 `ANYONE` 公開唯讀版延續 `study1V2PublicRpcDeny_` 直接封鎖。
- 前端 `gas/Study1Visitor.html`：寄件未知結果只用原 requestId 進行單次唯讀回查，**禁止自動重寄 OTP**；只有 PENDING 且 challenge 來源合理時才顯示驗證輸入。OTP 核驗回應不明時直接鎖住送出；F:G 成功一次性消耗後即停用核驗按鈕，Applicants 狀態回讀失敗不得重複提交舊碼或顯示完成。
- 安全：不新增/修改任何真實 Sheet 欄位或資料；本輪不調用 MailApp、不發真人郵件、不修改原 GAS／REC／私人 V1，不重新部署。不將 OTP 視為學籍/本人身分證明，不將 `PROVIDER_ACCEPTED` 或 challenge 存在視為郵件已送達。
- 測試：增量擴充原 `tests/study1-participant-intake.test.cjs` 與 `tests/study1-formal-browser-synthetic-e2e.test.cjs`，並沿用既有離線 CI；包含同一 requestId 回查、F:G 一次性、到期、取代、未授權、寄件不明、一次性核驗回應不明等負例。
- SYNC_STATUS：`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`；等待 CI、commit 與回讀確認後才能標明 GitHub 本輪已完成。

### 2026-11-12 21:40（Asia/Taipei）｜E1 OTP 唯讀回查與單次核驗離線 CI／main 回讀

- SOURCE_MAIN_SHA=`cca96aec8c1fda9963a110b3091b56f5e3d35064`；上述功能原始程式提交 `7aaef997635abe41bea0bb369b6451ea94c3130f`，後續兩個小修正僅使寄信未知提示與收件總閘門測試一致，分別為 `2178467ebd3dfb3a676ac4a18e8ef73a2591b421`、`cca96aec8c1fda9963a110b3091b56f5e3d35064`。
- CI_VERIFIED= [GitHub Actions Run #43229366518](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43229366518)，Job `public-safety` ID `131220592130`，原始日誌：`64 PASS / 0 FAIL / 0 SKIP`。先前 Run #43229135835 的 2 個測試訊息差異已修正並由此成功 Run 取代，沒有跳過失敗測試。
- WRITES_THIS_TASK=V2 GitHub 原 `gas/Study1ParticipantIntake.js`、`gas/Study1Visitor.html`、原兩份受影響測試、原離線 CI workflow、原 `docs/V2-MIGRATION-STATUS.md`；沒有新正式主檔或新 GAS 腳本。
- QUERY_SCOPE：OTP 不明寄信結果僅執行額外一次唯讀後端核對，使用既有高熵 requestId；原 MailApp 不自動重送；驗證已消耗或核驗結果不明時拒絕同一 OTP 重複驗證。讀取原 Verification 不宣稱電子郵件已送達或原 Applicants 已成功更新。
- READBACK：本段同步與 commit 更新後再回讀 GitHub main、檔案內容及變更清單；`MAIN_SYNC_VERIFIED` 僅在回讀成功時標示，不代替 GAS 同步／實機 UI。
- BLOCKERS：Google 帳號授權／部署未完成；`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。不變更原 GAS、正式 Sheets、REC 或私人 V1。

### 2026-11-12 21:45（Asia/Taipei）｜既有 E1 預約結果通知 outbox 納入同一離線 CI

- SOURCE_MAIN_SHA=`6ef5a36060e9376cf4f2528ba9c2193c874ce34e`；增量更新原 `.github/workflows/study1-v2-public-readonly-ci.yml`，將已存在的 `tests/study1-formal-notifications-outbox.test.cjs` 八項完整加入，不修改出站寄信或通知正式資料程式。
- VERIFIED_RUN=[GitHub Actions Run #43230248770](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43230248770)，Job `public-safety` ID `131223352229`；實際日誌 `72 PASS / 0 FAIL / 0 SKIP`。既有 outbox 防護涵蓋通知先持久化、同一次預約至多一次 MailApp 呼叫、timeout `UNKNOWN` 不自動重送、未確認預約／信箱／簽章不能寄送。
- IMPORTANT：`PROVIDER_ACCEPTED` 只代表提供者接受，非真實送達。無真人郵件、真實 GAS 部署、正式 Sheets 寫入或瀏覽器 UAT；公開版 OTP 與管理 RPC 仍維持封鎖。
- STATUS：`MAIN_SYNC_VERIFIED` 僅以最後 commit 及全文回讀判定；`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。

## 2026-11-12｜使用者最新來源決策：唯一新 V2，舊網站／舊 Github 永久停止建置

- TASK_DOMAIN=`Study1_V2_SINGLE_ACTIVE_SOURCE`；PRE_MAIN_SHA=`771b2dd39d9460467d99f0f6c6257dd422737818`；最新明確使用者決策：只持續處理 `solactw-star/study1-recruitment-e1-v1`，以新 V2 Script ID `1qg3PuI8sGFOAP-pJ889d9RrN0p_e0zsfqM274HgG4sEg9Qjv-xzqeL2f` 為唯一網站施工 GAS。原Repo `solactw-star/study1-recruitment-gas`、PR #133、原GAS與舊部署列 `LEGACY_FROZEN/READ_ONLY_ARCHIVE`，明確停止所有寫入／合併／同步／部署。原正式 Sheets/REC/RIF 資源未獲授權不修改。
- SPEC_DECISION_SYNC：在本 Repo 原 `docs/study1-system-spec.md` 增量 §70-S.35；覆蓋先前指向舊 Repo 或舊部署的施工路線（原功能歷史要求保留供閱讀），仍以本 Repo 原 `docs/V2-MIGRATION-STATUS.md` 為唯一網站接續點，不建立平行正式規格。
- AUTOMATION_SYNC_VERIFIED：原網站每小時 Automation ID `6ae2e4049ac48191b4e5ae8972bf5cc3` 已於 2026-11-12 更新成「Study1 V2 每小時網站建置」，沿用原 `FREQ=HOURLY`、`Asia/Taipei`、啟用狀態；工具回讀確認 prompt 指向新Repo、新Script ID、本規格／進度檔，並具 `LEGACY_FROZEN / READ_ONLY_ARCHIVE`、禁止更新舊Repo等明確條文。RIF 排程不受影響。
- SOURCE_SNAPSHOT：更新前新 V2 main=`771b2dd39d9460467d99f0f6c6257dd422737818`；本輪最近新 V2 程式安全 CI Run #43230248770（來源程式SHA `6ef5a36060e9376cf4f2528ba9c2193c874ce34e`）為 `72 PASS / 0 FAIL / 0 SKIP`；§70-S.35 僅更新新Repo文件，不執行 GAS／CI/正式資料修改；下輪均須讀當時最新main而不是固定舊SHA。
- ACTIVE_ENGINEERING：E1 五項MVP：報名/自陳/Email OTP、研究者預簽與本人最後簽PDF/副本、PI核定Slots/Reservations、Email結果通知outbox、OWNER必要後台；下一輪應接續預約狀態與PDF/OWNER整合。帳號授權與真實 UI 仍阻塞，**不阻擋新Repo離線程式建置**，不得以合成CI替代實機。
- CURRENT_STATE：`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`；`OPEN=false`、`CONSENT_READY=false`、私人 V1 不變；不寄真人Email、不收件、不更動原個資/營運 Sheets、REC 或原研究系統。
- PROJECT_INSTRUCTION_UPDATE：已準備將原研究專案指令 V2.6 之§2.3、§3.3、§4.3–4.4、§5.1、§6、§7 以新 V2 唯一來源及本次決策取代；ChatGPT Project 設定中的指令需另由有設定權限者貼入／確認，不能以本 Repo 寫入冒稱該設定已同步。

## 2026-11-12｜V2 E1 原 Slots／Reservations 讀取到期／UNKNOWN 因果回查

- TASK_DOMAIN=`Study1_V2_E1_ORIGINAL_BOOKING_CLOSURE`；PRE_MAIN_SHA=`f91ac9dd80dfbbb58ae8accae621f898a87d85b7`；正式來源僅新 V2 GitHub 主規格 §70-S.19、23–24、33–35。舊 GitHub、PR #133、舊 GAS `LEGACY_FROZEN`，不得寫入。
- 後端原 `gas/Study1FormalBooking.js`：以原有 ScriptLock 與原 Slots/Reservations 雙次唯讀快照，將已逾期的原 `HELD` 投影為 `EXPIRED`，**不改寫原十欄列與歷史**。新增私人 `study1FormalHoldOutcome` RPC，以本人 Email OTP、原 requestId 與 slotId 在原 Reservations 唯讀核對唯一 idempotency_key。無唯一紀錄只回 `UNKNOWN` 且不得重送，跨本人／場次即拒絕。公開 `ANYONE` 版本沿用伺服器端 RPC deny。
- 前端原 `gas/Study1Visitor.html`：一筆真 HOLD 回應未知時，僅以相同 requestId 做一次唯讀查核；原有效 HELD 再核對本人狀態，不能宣稱 CONFIRMED；無原列或資料矛盾時鎖定再次提交，禁止自動重播。原額滿及 FIFO 能力仍以原伺服器核定 E1 來源處理，不創建假場次。
- 原 `tests/study1-formal-v05-v08-original-booking.test.cjs` 與 `tests/study1-formal-v05-v08-browser-e2e.test.cjs` 新增零寫入到期、額滿阻擋、精確 requestId、丟失回應、UNKNOWN 不重送測試；納入既有 V2 CI，不取代原有測試。
- 無遠端 GAS／Sheet／REC／信件或私人版本 1 操作。Google 授權仍阻礙真 UI；`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。

### 2026-11-12 22:18（Asia/Taipei）｜原 Reservations HOLD／到期／確認／UNKNOWN 交易回查完成、最新 CI 回讀

- TASK_DOMAIN=`Study1_V2_E1_ORIGINAL_BOOKING_CLOSURE`；SOURCE_REPO=`solactw-star/study1-recruitment-e1-v1`；LAST_CODE_MAIN_SHA=`b6b32dd1f6d73d63e83a66080112b8016bc5df18`。
- LAST_VERIFIED_STEP：Run #43235789329 `completed/success`，Job `public-safety` ID `131242669661`，原始 Job 日誌 `94 PASS / 0 FAIL / 0 SKIP`。前兩次測試中揭露 `requestId` 與原 `WZ_` HMAC 鍵不相同、跨本人／場次只能查 `UNKNOWN` 而非預期 Exception；已修正實際回查算法及合成負測，沒有遮蔽或刪減測試。最新成功 Run 證據：https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43235789329。
- COMPLETED：原 `gas/Study1FormalBooking.js` 將仍儲存為 HELD 但依原 UTC 已到期的暫留唯讀投影為 EXPIRED，不更動原十欄 Reservations；新增公開版伺服器拒絕的私人 `study1FormalHoldOutcome` RPC，以同一本人 OTP 證據、slotId、requestId、原 PDF 版號/SHA 和既有正式 `WZ_` HMAC 算法，在共同 ScriptLock 與原兩次獨立 Slots／Reservations 快照下核對唯一來源列。無匹配列只回 UNKNOWN，跨本人／場次不揭露他人 ID，來源矛盾 fail-closed；不執行任何追加或補寫。
- COMPLETED：原 `gas/Study1Visitor.html` 遇 HOLD 回應逾時／未知，保留同一 requestId，只做一次本人唯讀因果回查；結果仍未知時封鎖再次提交，回查 HELD 時仍須再對原本人 Reservations 狀態查詢、核對同一 reservationId 才解鎖；不可把 HELD、已簽 PDF 或未知結果冒稱 CONFIRMED。原額滿拒絕、10 分鐘 HELD 與 2 分鐘 quote 均維持既有**待 PI 核定**工作暫設，不自動改政策。
- TESTS：增量擴充原 `tests/study1-formal-v05-v08-original-booking.test.cjs`、`tests/study1-formal-v05-v08-browser-e2e.test.cjs` 的額滿零新增、有效 HELD／到期 EXPIRED 無寫入、同 WZ_ HMAC 唯讀回查、本人及場次隔離、寫後回應丟失、UNKNOWN 不重送，以及獨立雙簽 PDF 後原 Reservations 才轉 CONFIRMED；加入既有 `.github/workflows/study1-v2-public-readonly-ci.yml`。
- BLOCKERS：PI 核定原 E1 Slots、正式場次/HMAC、真人預約與 PDF 政策、Google 授權／實際 UI 尚未確認。最後一次 Slots 只見表頭是歷史證據，本輪沒有重新讀正式 Sheet，不以其推定今日內容。仍須後續 PDF/OWNER 必要整合，不宣稱真人端到端就緒。
- WRITE_OWNER：唯一新 V2 GitHub `main`；本輪沒有任何舊 Repo／舊 PR／舊 GAS／正式 Sheets／REC／GAS 同步或部署操作。此段寫回後須再回讀 main SHA、commit 路徑及 blob。
- SYNC_STATUS：`MAIN_CODE_CI_VERIFIED=true`，`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`，`OPEN=false`／`CONSENT_READY=false` 仍為規定關閉狀態。
- NEXT_ACTION：繼續既有 E1 PDF 研究者預簽、最後階段本人線上簽署、完整雙簽副本與 OWNER 後台的原來源安全整合，離線增量測試；不待 OAuth，亦不碰正式 Sheets 或公開收件。

## 2026-11-12 22:55（Asia/Taipei）｜E1 OWNER 預簽完整 PDF、參與者簽署與私人副本整合建置

- TASK_DOMAIN=`Study1_V2_E1_PRESIGNED_PDF_OWNER`；SOURCE_ID/PATH=`solactw-star/study1-recruitment-e1-v1`／`docs/study1-system-spec.md` §70-S.24、§70-S.33–35；PRE_MAIN_SHA=`63c7ace4ed8e5b259362af24d31b03e82a8fa925`；LAST_CODE_MAIN_SHA=`7a28fac2c3121a4b672b1535f8ea83c3038285e3`。
- COMPLETED：在原 `gas/AdminConsole.html` 新增獨立 E1 OWNER 正式文件操作區，而非另建 Demo：先由研究者於網站外簽署**完整原 PDF**並確認日期，再由 OWNER 從瀏覽器選取完整 PDF，核對本地 SHA／原版號、逐頁人工確認預簽、用原 `study1ConsentVersionUpload` 上傳至原私人 Drive；上傳、`study1ConsentVersionSelect` 選用與 `study1ConsentVersionPublication` 設定受保護的正式簽署來源分開執行，均採原 revision 與伺服器 SHA 回讀；未知回覆鎖住重新寫入，僅能先唯讀核對，不盲目重送。既有舊逐筆研究人員第二次 PDF 簽名區保留程式但在現階段 E1 MVP 後台隱藏，避免誤用舊工作路線。
- COMPLETED：同一 OWNER 區以原 `study1EConsentOwnerList` 查詢已完成的預簽 E1 PDF 記錄，使用原 `study1EConsentOwnerSignedPdfDownload` 取得 PRIVATE 完整 PDF 位元組；瀏覽器獨立核對 recordId、PDF magic、長度及 SHA256 後才建立本機下載連結，不開放資料來源的公共 Drive URL。研究同意 `CONFIRMED` 仍不等於原 Reservations `CONFIRMED`。
- COMPLETED：原 `gas/AdminSandbox.js` 補強：(1) `study1ConsentPublicRead_` 不再把含研究者預簽筆跡與日期的 E1 原 PDF 經舊一般公開文件閱讀路徑洩出；正式參與者仍只能透過原本人資格／Email OTP／Reservations HELD／同意憑證授權閱讀。(2) OWNER 完整雙簽 PDF 下載除原 PRIVATE 檔案 SHA 外，獨立核對同一 participantSignedPdf ID/SHA、原簽署與確認事件，以及簽署 UTC／Asia/Taipei 日期一致性，篡改一律拒絕。
- EXISTING_PRESERVED：原 `study1EConsentSignPdf` 的參與者最後階段手寫 PNG、伺服器臺灣日期、完整原版 PDF 加簽、私人索引／事件／檔案持久化及一次性 CAS；原 `study1EConsentSignedPdfCopy` 本人完整副本、SHA 及雙簽來源核驗均保留，不重建已測試核心，不把合成資料當成正式收件成果。OWNER 對研究者預簽的真人簽章真偽仍需實際逐頁人工審查，程式無法僅從 PDF SHA 辨認簽名真偽。
- CHANGED_PATHS：`gas/AdminSandbox.js`、`gas/AdminConsole.html`、`tests/study1-admin-sandbox.test.cjs`、`tests/study1-signed-pdf-record.test.cjs`、`tests/study1-owner-presigned-pdf-ui.test.cjs`（新增同一 Repo 內的測試）、`tests/study1-admin-console-interaction.test.cjs`、`.github/workflows/study1-v2-public-readonly-ci.yml`、本原進度檔。舊 Repo／PR #133／舊 GAS 依 `LEGACY_FROZEN / READ_ONLY_ARCHIVE` 永不寫入。
- CI_VERIFIED：新 V2 GitHub Actions [Run #43241964623](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43241964623)；Job `public-safety` ID `131264496895`，核對 Job 日誌 `214 PASS / 0 FAIL / 0 SKIP`，來源 SHA `7a28fac2c3121a4b672b1535f8ea83c3038285e3`；含公開版後台與私人 RPC 封鎖、PDF 上傳／選用／受保護來源各自 revision 驗證、資料不明不得盲目重送、完整 SHA 下載正負例、本人 OTP／HELD 同意綁定、PDF Stamp 全頁／臺灣日期、私人 registry 及 OWNER 原預約一致性測試。舊測試原假設 owner 可在 V2 公開版開 admin／preview，已改成符合最新唯讀拒絕規則，未刪減測試或放寬路由。
- BLOCKERS：Google 帳號授權／同一 V2 GAS 實際同步與公開版 UI 尚無新證據；研究者實際預簽正式 PDF 檔與簽章、PI／研究行政的適用 REC 結論、PI 核定原 E1 Slots/政策、正式原 Drive/Sheet 權限和 UAT 皆未核實。本輪只建置 GitHub 程式／離線測試；沒有實際開啟來源或產生正式簽署。
- WRITE_OWNER：唯一新 V2 GitHub。除指定程式、測試與進度外，未寫原 GAS/私人 V1、正式 Sheets、REC、舊 Repo、RIF Context 或真實研究資料；未寄信、未同步 GAS HEAD、未部署或開啟真人收件。
- SYNC_STATUS：`MAIN_CODE_CI_VERIFIED=true`，但 `GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`；規定仍為 `OPEN=false`、`CONSENT_READY=false`。
- NEXT_ACTION：依最新新 V2 main 接續 OWNER E1 報名／原 Reservations／Email OTP 與 outbox／PDF 私人副本的必要後台狀態整合與離線負測；只有獨立授權後才分開執行 GAS 同步、公開唯讀部署與三項最小真實 UI smoke，真人收件仍需 PI/REC 審查與另行授權。

## 2026-11-12｜V2 E1 舊研究員第二次簽署程式清除（使用者最新明確決策）
- TASK_DOMAIN=`Study1_V2_REMOVE_OBSOLETE_SECOND_SIGNATURE`；SOURCE_PATH=`solactw-star/study1-recruitment-e1-v1`／`docs/study1-system-spec.md` 最新 §70-S.36；PRE_MAIN_SHA=`899ff1532ebb76019853096eb73af9983cad7fce`。
- DECISION：網站尚未正式上線，不再保留舊研究員逐筆二次加簽、舊式邀請、單獨 PNG 簽署或事件確認的程式相容層；既有需要合法處置的撤回流程保留。本次僅清除**新 V2 Repo** 已淘汰來源，絕不寫舊 Repo／GAS／正式 Sheet／REC。
- CODE_DIFF：原 OWNER `AdminConsole.html` 完全移除隱藏二次簽名區與 `staffPdfSetup_`，獨立保留撤回後處置讀取；原 `AdminSandbox.js` 移除 `study1EConsentConfirmPdf`、二簽待辦及舊式手動邀請／研究員逐筆說明／單獨 PNG/事件確認/回執 RPC，並讓 `study1EConsentSignPdf` 唯一接受 `FORMAL_E1`、已預簽、本人可信綁定、`ISSUED` 原憑證；本人 `study1EConsentSignedPdfCopy` 僅放行原預簽加一次本人簽署的完整 SHA/日期事件鏈；原 PDF stamp 刪除研究員二次簽名的座標讀取與合成引擎。原 `Study1FormalConsent.js` 的原版 PDF/狀態只接受正式預簽流程。
- TESTS：刪除對已不存在功能做成功路徑的舊合成測試，替代為「舊 RPC 完全不存在」、非正式本人/非預簽/重送不得簽、完整副本 SHA/日期/ACL、原 OWNER UI 二次簽章區不存在且撤回仍可查等負測；納入既有 V2 安全 CI 及 REC 源流程檢查。
- WRITE_OWNER：僅新 V2 GitHub `main`；未進行 GAS HEAD PUT/部署、正式資料或郵件存取、真人收件啟用。同步狀態必須以下一 commit／CI 實際結果回讀為準，未回讀不得宣稱完成。原 `OPEN=false`／`CONSENT_READY=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。

- SOURCE_VERSION/SHA：最新已通過 CI 的程式 main = 157977bd8fe60d3e6233e891c731967bc0d41423；核心移除提交 e74ae53b4ecb77eb1da5fd1286227480ead3b75a，測試修正提交 157977bd8fe60d3e6233e891c731967bc0d41423。原功能與測試檔案共計 13 個不同路徑受增量修改，舊 Repo／GAS 來源完全未觸及。
- LAST_VERIFIED_STEP：GitHub Actions Run #43244927252（job 131274911667），原始 Job 日誌已回讀：216 tests／216 PASS／0 FAIL／0 SKIP；已用相同 SHA 核對現行 main、正式規格 §70-S.36、原進度檔、受影響 code path 與完整 commit changed files list。
- COMPLETED：原新 V2 gas/ 內已不存在研究員二次簽章函式或隱藏 UI；現存 E1 簽署核心限定 researcherPresigned=true、FORMAL_E1、ISSUED、原本人 OTP/Reservations 綁定與原 PDF SHA，無相容 fallback；本人/OWNER PDF 副本驗證及撤回流程仍存在；公開登入唯讀版本繼續拒絕所有私人 RPC。
- BLOCKERS/NEXT_ACTION：Google OAuth／正式核定預簽 PDF 與頁碼欄位／PI 原 E1 Slots／實際私人 Drive 與真人 UI 尚未取得新驗收證據；下一輪僅按唯一新 V2 main 接續剩餘正式 OWNER E1 管理、Email/預約與副本狀態整合。新的公開 GAS 同步與部署需獨立授權，現階段不啟用真人收件。
- WRITE_OWNER=solactw-star/study1-recruitment-e1-v1；SYNC_STATUS：MAIN_CODE_CI_VERIFIED=true；GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false；PUBLIC_DEPLOYED=false；PUBLIC_UI_VERIFIED=false；FORMAL_READY=false；LIVE_INTAKE_ENABLED=false。舊網站 Repo／PR／GAS 一律 LEGACY_FROZEN／READ_ONLY_ARCHIVE，不執行寫入。

## 2026-11-12｜V2 GAS 無依賴舊入口與 E1 非預簽相容路線的安全清理

- TASK_DOMAIN=`Study1_V2_GAS_DEAD_EXECUTABLE_PRUNE`；SOURCE_ID/PATH=`solactw-star/study1-recruitment-e1-v1`，正式規格 §70-S.34–36；PRE_MAIN_SHA=`b231b460df5536de965496f7b8c20840d3b227a5`；LAST_CODE_MAIN_SHA=`309ee5db6a2194e4cd49df11328d203310daeb12`。
- COMPLETED（`e01f822920f9c291cac9d0b357609bd539b90e65`）：直接移除 `gas/Website.js` 中所有已被前置 deny-all 阻擋、永遠不可達的 `admin/team/preview/demo` HTML 建立分支，只保留研究資訊首頁和 `view=apply`、`flowMode=FORMAL` 的關閉頁；刪除沒有任何功能的原 `gas/程式碼.js` 預設 `myFunction`，一併將原 V2 `scripts/study1-v2-gas-head-only.cjs` 固定來源清單由 32 份改為 31 份，修改既有公版安全/HEAD-only 負測。刪除未使用的 `SITE_RESOURCES_` 伺服器常數；不刪歷史來源定位檔。
- COMPLETED（`309ee5db6a2194e4cd49df11328d203310daeb12`）：原 `gas/Study1Visitor.html` 正式 E1 同意流程的 `formalConsentRender_`、`formalConsentStatus_`、`formalVerifySigned_`、簽名畫布放行與本人原邀請查核現在嚴格要求 `researcherPresigned/researcherPreSigned===true`；非預簽來源不得讀取私人 PDF、不得簽名或取得以研究員事後加簽路線形成的副本。舊「先由參與者簽署、再由研究者確認」的瀏覽器成功路徑測試替換為非預簽拒絕負測；有效研究者預簽的本人筆跡/完整 PDF 保存與原 Reservations 獨立核對測試保留。
- PRESERVED_DUE_TO_DEPENDENCIES：`gas/Study1Unified.js`、`gas/Study1Unified.html`、`gas/Study1Team.html`、`gas/Study1FixtureAdapter.js` 與 `Study1Visitor.html` 非正式 Demo 模擬相關區段仍被既有 fixture／Team/UI／測試引用，未達「已確認無依賴」的刪除門檻；`doGet` 已不會公開建立這些管理/測試頁，所有私人 RPC 維持伺服器端拒絕。此為剩餘待專項拆依賴工作，不能稱所有 Demo 原始碼均已清零。
- LAST_VERIFIED_STEP：GitHub Actions [Run #43249257289](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43249257289)，Job `public-safety` #131290255240，原始 Job log：`216 tests／216 PASS／0 FAIL／0 SKIP`，對應 `309ee5db6a2194e4cd49df11328d203310daeb12`。Run #43247507062 曾有 1 項舊研究員事後確認瀏覽器測試失敗，已更換為非預簽拒絕負測且同新 SHA 通過，沒有關閉或略過安全測試。
- WRITE_OWNER：本輪只寫新 V2 Repo 現有 GAS 原始碼、V2 HEAD-only 清單、相關測試與本原進度檔；未操作舊 GitHub／舊 GAS、原私人 GAS v1、正式 Sheets／REC／RIF 研究資料、GAS HEAD、部署、真人信件或正式收件。正式 `OPEN=false`／`CONSENT_READY=false`；`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。
- BLOCKERS：現行 GAS 31 份原始碼清單只在 GitHub 核對，尚未以 OAuth 對**同一 V2 GAS** 完成安全來源同步；原遠端檔案數未於本輪重查，不推定實際 HEAD 一致。非正式 Demo 模擬器仍與舊測試耦合，須先證明與正式 E1 的函式／測試依賴可隔離才可能逐檔清除。
- NEXT_ACTION：只在唯一 V2 Repo 按實際依賴拆分／移除剩餘 Demo 執行路徑，不任意刪除現有正式 E1 必需的 OTP、原 Slots/Reservations、OWNER PDF／電子同意、撤回與私人事件證據；沿用 V2 CI 負測，待獨立授權與 Google OAuth 後才分開執行 V2 GAS 原始碼同步或唯讀部署。

## 2026-11-13｜V2 E1／Unified、Team、Fixture、Visitor Demo 跨檔案依賴隔離
- TASK_DOMAIN=`Study1_V2_E1_SYNTHETIC_RUNTIME_ISOLATION`；SOURCE_ID/PATH=`solactw-star/study1-recruitment-e1-v1`／`docs/study1-system-spec.md` §70-S.34–36；PRE_MAIN_SHA=`d796b3deb58ffdda10a431957aa33346a3ece7fa`（使用者指定 `d8220c843121d38855b68e41e54feb409eb4feb7`，開始時正式 main 已新增四 commit）。
- DEPENDENCIES：`Study1Unified.js` 內含虛構狀態機、B01–B12 與 7 個合成 RPC；`Study1FixtureAdapter.js` 依賴合成 OTP／Booking helper；`Study1Unified.html`／`Study1Team.html` 維持離線 VM／Team 測試引用。正式 E1 的 `AdminSandbox.js`、`AdminConsole.html`、`Study1FormalBooking.js`、`Study1FormalConsent.js`、`Study1ParticipantIntake.js`、`Study1EConsentBinding.js`、`Study1WizardP0Bridge.js` 無合成 RPC／Fixture 正式呼叫依賴。`Study1Visitor.html` 正式控制器不呼叫合成 RPC，Demo 控制器已具 `siteMode==='FORMAL'` 早退；Demo 原碼尚未物理移除，不能聲稱清零。
- COMPLETED：`scripts/study1-v2-gas-head-only.cjs` 新增正式來源隔離與防回灌檢查，四個不具正式 E1 依賴的合成執行檔 `Study1FixtureAdapter.js`、`Study1Team.html`、`Study1Unified.html`、`Study1Unified.js` **不再納入 V2 GAS HEAD 發布來源**（31→27）；仍保留於原 Repo 做歷史離線測試，不刪減測試及其參照材料。新增正式 GAS 不得呼叫 fixture、禁止回灌上述合成模組、FORMAL/Demo 雙向模式門檻的安全負測；更新原 `tests/study1-v2-public-readonly.test.cjs`、`tests/study1-v2-gas-head-only.test.cjs` 及 CI Workflow，同時讓本進度檔更新觸發最新 SHA CI。
- LAST_VERIFIED_STEP：程式＋測試＋進度同一提交 `fed9133b7dcb384307f2f4841f6196e9c6a472ba` 已回讀 GitHub main 及五個變更路徑；同 SHA GitHub Actions Run #43379579618，Job `public-safety` #131733957600，原始日誌 `222 tests / 222 PASS / 0 FAIL / 0 SKIP`，2026-11-13T06:34Z `completed/success`，`MAIN_CODE_CI_VERIFIED=true`（僅針對此來源版本，非 GAS 同步或 UI）。進度更新後另以最新 docs-only SHA 重新執行安全 CI 並回讀。
- WRITE_OWNER：僅新 V2 Repo；NEXT_ACTION：CI 成功後再將 Visitor Demo 控制器轉為純測試檔，確認其他依賴解除後才物理刪除舊執行程式。BLOCKERS：歷史 Team/Unified 測試大量交互依賴尚待逐段搬遷；PI 核准正式 E1 Slots／預簽完整 PDF、Google OAuth／GAS 同步／真實 UI 未核實。
- SYNC_STATUS：`OPEN=false`、`CONSENT_READY=false`、`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`；沒有修改任何舊 GitHub／GAS、正式 Sheets、REC 或真人收件。
- DEPENDENCY_REVIEW_ADDENDUM：另核對現存 `scripts/study1-gas-auto-index.cjs`、`scripts/study1-gas-backend-allowlist.cjs`、`scripts/study1-gas-public-release.cjs`、`scripts/study1-gas-owner-preview-deploy.cjs` 仍引用舊 Unified／Team HTML 或其歷史打包名稱；此屬 Legacy 流程唯讀相容來源，不是 V2 `study1-v2-gas-head-only.cjs` 的正式可執行依賴，不可自行重新啟動、用其同步舊 GAS 或因清除而破壞既有測試。現階段不刪除依賴未解除之檔案。

## 2026-11-13｜V2 E1 Visitor Demo 控制器正式退出 GAS（CI 待同 SHA 核對）
- TASK_DOMAIN=`Study1_V2_VISITOR_FORMAL_ONLY_PRUNE`; SOURCE_ID/PATH=新 V2 main `solactw-star/study1-recruitment-e1-v1`，§70-S.34–36；PRE_MAIN_SHA=`6c280301704ddf2860a67fcf12713364c1165ae5`。
- COMPLETED：原 `gas/Study1Visitor.html` 只保留 FORMAL 控制器，實際移除第二段 `study1UnifiedPreviewGet/Command` 合成執行 JavaScript；固定 FORMAL 模式，更新曾帶有示範信箱／假 OTP／虛構預約與同意字樣的正式畫面文案，預設關閉歷史示範結果元件；原七步正式 DOM、原 Slots/Reservations、本人 OTP、完整 PDF 與七步結果核驗程式保留。
- TEST_ONLY_ARCHIVE：原完整 Visitor Demo HTML 原樣保存在 `tests/fixtures/Study1Visitor.demo.html`，僅供隔離 VM 回歸參照，不列 GAS 正式來源；Team／Visitor／V06 舊測試改讀此 fixture，不改原正式 GAS 同意／預約／通知核心。
- TESTS：原 V2 公開安全及 HEAD-only 負測要求正式 HTML 不含 Preview/Fixture 呼叫且只有 FORMAL 門檻；原正式 Browser E2E 調整讀取單一控制器邊界。保留既有 CI，並回讀對應 SHA，失敗不得假通過。
- LAST_VERIFIED_STEP=`CI_PENDING`；WRITE_OWNER=唯一新 V2 GitHub；NEXT_ACTION=驗證新 main CI 並核對是否仍可實體搬離四個合成 GAS 元件；BLOCKERS=正式 E1 核定資料／OAuth／真正 UI；`OPEN=false`、`CONSENT_READY=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`、`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`。

- CI_REPAIR_2026-11-13：新 Visitor FORMAL-only SHA `b73eb852a520f39a1700c8081cb2298f91ba3f67` 的 Run #43396439242 實際 `217 PASS / 1 FAIL`，因原 `study1-signed-pdf-wizard-readback.test.cjs` 仍用正式 GAS 讀取已退出的舊 DEMO `officialSignedPdfVerify_`，非現行 FORMAL 的 `formalVerifySigned_`。修正原測試僅將其既有虛構 PDF 測試來源改指 `tests/fixtures/Study1Visitor.demo.html`，保留所有測試與負例，不恢復舊 DEMO 正式程式。增列 FORMAL intake 的既有靜態檢查入安全 CI。本段更新後以新 SHA CI 回讀，不得宣稱先前失敗 SHA 通過。

- CI_REPAIR_2026-11-13_2：`ec44724c8ce4e15472268c4b0f61e43c0f673f8a` Run #43396600310 實際 `229 PASS / 1 FAIL`（增加 FORMAL 靜態測試後，尚有一條原 Demo 路由單行正規式不符現行已加嚴的 public deny／換行程式）。只更新該測試為符合現行 `e.parameter.view==='apply'` 與輸入換行及已拒絕 Demo 路由的保護契約，不改已通過之正式路由程式；下個 SHA 必須重新回讀 CI。


## 2026-11-13｜V2 Unified／Team／Fixture 原 GAS 執行來源實體移除（CI 待新 SHA）
- TASK_DOMAIN=`Study1_V2_RETIRED_GAS_EXECUTABLE_PHYSICAL_PRUNE`；SOURCE_ID/PATH=`solactw-star/study1-recruitment-e1-v1` 唯一 main，正式規格 §70-S.34–36；PRE_MAIN_SHA=`a5b0507d6d2f8b3e6f1eb1c2bded4fe39029ff0d`。
- DEPENDENCY_VERIFIED：正式 E1 的 `Study1FormalBooking`、`Study1FormalConsent`、`Study1ParticipantIntake`、`Study1EConsentBinding`、`Study1WizardP0Bridge`、OWNER `AdminSandbox`／`AdminConsole` 均無 Unified／Fixture RPC 正式依賴。原 `Study1Visitor.html` 已於前一輪獨立移除 DEMO 控制器（前一 SHA Run #43396712709 `230 PASS / 0 FAIL`）。
- COMPLETED：將 `Study1Unified.js`、`Study1Unified.html`、`Study1Team.html`、`Study1FixtureAdapter.js` 四份完整原始位元組搬至 `tests/fixtures/legacy-gas/`，更新引用它們的既有離線 VM／B01–B12／合成測試改讀同一 test-only fixture；從 `gas/` 實體刪除四個原檔。新 V2 `scripts/study1-v2-gas-head-only.cjs` 從「忽略這些程式」改為「一旦重新出現即 fail-closed」，維持**只有 27 個已審查的正式 GAS 來源**。
- TESTS：新增 V2 `tests/study1-legacy-quarantine.test.cjs` 鎖定四份原始 Git blob SHA、正式 27-file inventory、正式 RPC 伺服器端拒絕、舊 fixture 不能回灌的負測；V2 CI 加入新檢查、原合成 OTP/Booking adapter 離線測試與 fixture 的 JS syntax。保留歷史測試資料及其他未被使用者授權刪除的程式，不操作任何舊 Repo/GAS。
- LAST_VERIFIED_STEP=`CI_PENDING`，新 SHA 仍須回讀；WRITE_OWNER=新 V2 GitHub。NEXT_ACTION=確認最新 SHA CI 及原 main/檔案清單，必要時修復出錯的 legacy test loader，且**不得刪減或跳過安全測試**。
- BLOCKERS：舊 `scripts/study1-gas-*` 是歷史／legacy 同步工具，不是 V2 正式操作路線；相關舊部署流程不得啟動。GAS HEAD 未獲同步授權或 OAuth，公開唯讀真實 UI 未驗收；PI 核准場次、正式預簽 PDF 與 REC 適用結論不由本清理作出。
- SYNC_STATUS：`OPEN=false`、`CONSENT_READY=false`、`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。

- CLEANUP_FINAL_UI_2026-11-13：已驗證 `1e477a4463a0b9e6364c44b3370bc30ac0ecd778` Run #43397869494 的 Job public-safety #131793126185，原始日誌 `237 PASS / 0 FAIL / 0 SKIP`，完整原 4 份 test-only fixture SHA 與正式 27 files 均成功。額外移除正式 `gas/Study1Visitor.html` 中已隱藏且無 E1 依賴的 Demo Done 結果與 V07/V08 TEST 因果卡 HTML、其僅負責隱藏的 dead JS，正式 `formalDoneResult`、`formalVerifySigned_`、`formalReceiptOutcome_` 保留；加強靜態負測。這是原 GAS HTML 的無依賴清理而非 GAS 部署，須回讀下個新 SHA CI。

- CI_REPAIR_FINAL_UI_2026-11-13：正式 HTML 精簡提交 `f1e6ce14077d6ae2bc444e8479ff7821b89fa3ff` Run #43398365889 實際 `236 PASS / 1 FAIL`，原因是舊靜態測試仍強制要求已確認只屬 Demo 管理卡的 `id=v08ManageReview`。測試改核對原正式 E1 的 `formalDoneResult`、原 V05/V08 時段必要節點與正式 RPC，不恢復已淘汰 Demo DOM 或減少測試數。下個 SHA CI 結果須重新核對。


### 2026-11-13｜本輪結案回讀：V2 FORMAL E1／TEST 相依隔離與已淘汰執行程式清除
- TASK_DOMAIN=`Study1_V2_E1_SYNTHETIC_DEPENDENCY_PRUNE_COMPLETED`
- SOURCE_ID/PATH=`solactw-star/study1-recruitment-e1-v1`／`docs/study1-system-spec.md` §70-S.34–36／`docs/V2-MIGRATION-STATUS.md`，`SOURCE_VERSION/SHA=1ebe91cffa30c2ce72210c859cc813df711b789f`。
- LAST_VERIFIED_STEP：2026-11-13（Asia/Taipei），新 V2 GitHub Actions Run [#43398477846](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43398477846) `completed/success`，Job `public-safety` #131795111104 原始日誌 `237 tests / 237 PASS / 0 FAIL / 0 SKIP`，Run 的 HEAD 正是上列程式 SHA；當輪最後進度紀錄純文件更新後，需另核對最新 main SHA 與該 SHA CI，不以本 SHA 代替文件提交後結果。
- COMPLETED：原 `gas/Study1Unified.js`、`Study1Unified.html`、`Study1Team.html`、`Study1FixtureAdapter.js` 四個合成執行來源**已從正式 gas 根目錄實體刪除**，原 Git blob SHA 分別 `ef489b01d25a81c9f71af15476b55df7dec63f3f`、`15f50b46aa01e520208f6b7c01846fa5dea935a6`、`066f086b302793f82280c007166d0f427a632003`、`2230b704fd7ce560b0691ac4314b7a99c749e5d8`，完整保留在 `tests/fixtures/legacy-gas/` 並逐份 SHA 負測；不得將此保存當成 GAS 或正式 Roster。
- COMPLETED：`gas/Study1Visitor.html` 正式 FORMAL 控制器獨立保留；舊 Demo 第二 IIFE（約 64 KB）以及無正式依賴的 Demo Done/V07 TEST 結果 DOM（約 2.6 KB）已實體移除；原完整 Demo HTML 唯一保存於 `tests/fixtures/Study1Visitor.demo.html` 供舊離線回歸。正式 `formalVerifySigned_`、`formalReceiptOutcome_`、E1 報名／OTP／正式 Slots/Reservations、完整預簽 PDF／本人簽署與 OWNER 下載／撤回安全核心保留。
- COMPLETED：正式 `scripts/study1-v2-gas-head-only.cjs` 僅認 27 個審查過的 GAS source，且**禁止再次加入**任何四個已淘汰模組；`tests/study1-legacy-quarantine.test.cjs`、既有 V2 安全、正式 Browser E2E、原合成 OTP adapter 負測均進入同一 CI，未刪減測試、未以 skip／假成功處理。
- VERIFIED_BLOB_SHA：`gas/Study1Visitor.html`=`489dcb48c29a378fa40c72f64ba62da627c7c034`；`scripts/study1-v2-gas-head-only.cjs`=`5fece6f15d35fabfbc7a68c1cb82d690282d5433`；`tests/study1-legacy-quarantine.test.cjs`=`ca46c910a7a77320e15a67ce4f8950cc8360b6ed`。
- WRITE_OWNER=僅新 V2 GitHub。舊 GitHub／PR #133／舊 GAS、正式個資及場次 Sheets、REC、正式研究刺激及 RIF Context 均未寫入、未讀取私人內容；沒有執行 OAuth、GAS HEAD PUT、版本／部署、真人 Email、OTP 或任何正式收件。
- BLOCKERS：本輪僅 GitHub 程式清理與離線 CI，尚無同一 V2 GAS 遠端 SOURCE_SYNC 實際回讀；Google 一般帳號真 UI、PI 核定 E1 Slots/政策、研究者預簽正式 PDF、PI／研究行政 REC 適用結論與正式營運 UAT 仍不具新核實證據；歷史 `scripts/study1-gas-*` 僅能封存唯讀，不得由此恢復舊部署。
- NEXT_ACTION：不再將舊 Demo 當成 E1 MVP 工程；後續依唯一 V2 main 聚焦五項正式營運端到端及獨立授權的 GAS 同步／公開唯讀部署／真人 UAT。除非有新的正式相依證據，不恢復四個淘汰模組。
- SYNC_STATUS：`MAIN_CODE_CI_VERIFIED=true`（限本 SHA）；`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`，`OPEN=false`、`CONSENT_READY=false`、`E2_OPEN=false`。


## 2026-11-13｜V2 E1 正式流程跨檔案核對與 OWNER 讀取營運狀態增量
- TASK_DOMAIN=`Study1_V2_E1_END_TO_END_OPERATIONS_AUDIT`；PRE_MAIN_SHA=`79229ac6bf1ea5127988b166dd284fad9011e649`；SOURCE_ID/PATH=`solactw-star/study1-recruitment-e1-v1` 的唯一正式 `main`、`docs/study1-system-spec.md` §70-S.34–36、本 `docs/V2-MIGRATION-STATUS.md`。
- DEPENDENCY_TRACE：E1 `Study1Visitor.html` → `Study1ParticipantIntake.js` 原 Applicants/Screenings/Verification／OTP（不以學生證核身）→ `Study1FormalBooking.js` 原 Slots/Reservations HELD/CONFIRMED/UNKNOWN → `Study1FormalConsent.js` 原研究者預簽受保護 PDF 與同意憑證 → `AdminSandbox.js` 本人最後手寫加簽、完整 PDF SHA/PRIVATE 索引，獨立 finalize 原 Reservations → `Study1ParticipantIntake.js` Notifications A:I 的 DISPATCHING/PROVIDER_ACCEPTED/UNKNOWN 至多一次通知。原 `study1ParticipantBookingNotice_` 已由本人簽署成功路徑實際呼叫，非未連線死碼；簽署與預約不同交易，不把 PDF CONFIRMED 直接等同預約確認。
- REAL_GAP：現有 OWNER `AdminConsole.html` 只有預簽 PDF／已簽副本、原場次與合成測試預約；缺少可直接對照正式 E1 每筆同意、原 Reservations 狀態與 Notifications outbox 的唯讀營運清單，UNKNOWN 需人工核對且不能當已送達。不能只靠舊 Team Demo 偽造 OWNER 完整管理。
- CODE_DIFF：`gas/Study1ParticipantIntake.js` 同原 Notifications A:I 來源新增 `study1OwnerE1NotificationAudit`，公共版先拒絕、OWNER 雙重驗證及 ScriptLock、兩次來源一致性快照、行／job HMAC／attempts／provider status 防變動；只回傳正式同意 ID、同意狀態與 `NOT_QUEUED/PROVIDER_ACCEPTED_NOT_DELIVERED/UNKNOWN_REQUIRES_STAFF_REVIEW/SOURCE_MISMATCH`，無 Email／個資／Drive URL，不觸發寄信或寫入。原 `AdminConsole.html` 新增 OWNER 唯讀營運區，依原 `study1OwnerE1ConsentBookingAudit` 與新 outbox RPC 比對同一 registry revision、完整 ID 集合，失配 fail-closed，不以任何通知狀態推定寄達。新合成安全/失敗負測與既有 V2 公開 CI 一併執行。
- WRITE_OWNER=僅新 V2 GitHub；LAST_VERIFIED_STEP=`CI_PENDING_NEW_SHA`，需同 SHA CI 及 blob/readback；BLOCKERS=目前公開 V2 全部私人 RPC 一律拒絕、實際 OWNER/Google OAuth UAT 及 PI/REC 核准 E1 Slots/預簽 PDF 尚未核實，不能宣稱正式可營運。
- NEXT_ACTION=回讀 CI、修正測試與狀態，後續按正式 MVP 最短路徑補 OWNER 原預約與簽署後狀態人工核對；不額外建立通知寄件入口、不重送失敗郵件。
- SYNC_STATUS：`OPEN=false`、`CONSENT_READY=false`、`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`；不操作舊 Repo/GAS、正式 Sheets、REC 或真人收件。

- CI_REPAIR_2026-11-13：程式 SHA `10be9d0a975773deda5d0bdffed86a181aa38241` 的 Run #43400450407 實際 `243 tests / 234 PASS / 9 FAIL`，源於安全掃描要求所有可被 GAS 直接呼叫的 OWNER RPC 在函式起始立即執行 public deny（原新 RPC 換行未符合 scanner），以及新 Node VM 測試未注入既有 `STUDY1_E1_NOTIFICATION_HEADERS_` 常數；已做最小修正，不放寬 scanner、沒有取消測試或改正式資料，下一新 SHA 必須回讀。

- CI_REPAIR_2026-11-13_2：`44785b986628b5feb2b3013b3667b1556591e9aa` Run #43400658501 實際 `247 tests / 246 PASS / 1 FAIL`，唯一失敗是新 outbox 異常列測試在 assert.throws 前先呼叫會丟錯的函式；已調整測試斷言執行順序，生產程式與嚴格安全檢查維持不變。下一 SHA CI 需重新回讀。


### 2026-11-13｜E1 OWNER 正式預約／通知聯合查核：實質程式回讀驗證
- TASK_DOMAIN=`Study1_V2_E1_END_TO_END_OPERATIONS_AUDIT`；SOURCE_ID/PATH=`solactw-star/study1-recruitment-e1-v1`／`docs/study1-system-spec.md` §70-S.34–36、`gas/Study1ParticipantIntake.js`、`gas/Study1FormalBooking.js`、`gas/Study1FormalConsent.js`、`gas/AdminSandbox.js`、`gas/AdminConsole.html`、`tests/study1-owner-e1-operations-audit.test.cjs`、`.github/workflows/study1-v2-public-readonly-ci.yml`。
- SOURCE_VERSION/SHA：本輪可執行程式與測試 main=`ebb35376fe70b55facfba9429a613509d9c9e3e8`；直接受影響 blob SHA：`Study1ParticipantIntake.js=6449bd04ad5a952e1083d53374639b6c09ab4fe0`、`AdminConsole.html=aaf4caa850ff9003a7dcef0e36976b4e61114e73`、`tests/study1-owner-e1-operations-audit.test.cjs=276c6c992d8ee7049b6bd584aea68e74d623a968`、`study1-v2-public-readonly-ci.yml=85c945fa0c9f0b3062d06bdc0cc82b31b1cdaf75`。
- LAST_VERIFIED_STEP：GitHub Actions [Run #43400802787](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43400802787)，Job `public-safety` #131802863253，嚴格核對相同 HEAD `ebb35376fe70b55facfba9429a613509d9c9e3e8` 的原始日誌：`247 tests / 247 PASS / 0 FAIL / 0 SKIP`、`completed/success`。本次僅在原進度檔追加結案驗證，文件 commit 後須用**最新文件 SHA** 重新回讀 CI；舊程式 SHA 的 CI 不直接作新 SHA 證據。
- COMPLETED：沿正式 E1 本人自陳、原 Verification Email OTP、原 Slots/Reservations HELD/CONFIRMED/UNKNOWN、研究者預簽原版 PDF、本人最後一簽與完整私人雙簽 PDF、通知 outbox 至多一次送信，核對主前後端和既有合成安全負測，確認 `AdminSandbox.js` 正式簽署成功路徑原有 `study1FormalFinalizeSignedE1Booking_` 後的 `study1ParticipantBookingNotice_` 呼叫**已存在，非遺漏**。未改動核心寫入交易及官方研究資料。
- REPAIRED_GAP：OWNER 先前只能從 PDF 與 Demo/場次區分別查詢，無法在同一正式頁核對原同意紀錄、原 Reservations 和 Notifications outbox；新增 `study1OwnerE1NotificationAudit()` 僅在非公開且 OWNER 已驗證之環境運作，雙次原 Notifications A:I 唯讀快照、ScriptLock、job HMAC、同意 ID／申請人 ID／預約 ID、通知狀態及 attempts 驗證，遇未知、重複、競寫、欄位差異 fail-closed；只回傳不含姓名、Email、健康資訊、Drive URL 的 E1 同意 ID／狀態。原 `AdminConsole.html` 增設 OWNER 三來源聯合核對，交叉驗證獨立 `study1OwnerE1ConsentBookingAudit` 的原預約狀態、同一同意 registry revision 與 ID 全集；任何不匹配不顯示虛構成功。無寄信、補寄、寫入或改版號操作。
- NEGATIVE_TESTS：非 OWNER 必須在私人讀取前拒絕，V2 公版必須在 OWNER 認證前拒絕；Notifications 兩次讀取不一致、紀錄缺欄／重複／偽造 job、非同一 Applicant/Reservation、MAIL 失敗或結果不明、前端同意 revision 或 record ID 不同時均不得宣稱預約或通知完成；`PROVIDER_ACCEPTED` 僅標「服務接受，未證實實際送達」，未新增任何可重送 API。受影響 247 項安全與失敗負測全部通過，歷史離線其他測試不因此視為全數驗收。
- BLOCKERS：公開 V2 `ANYONE/USER_DEPLOYING` 仍強制封鎖所有 OWNER／報名／OTP／PDF／通知私人 RPC；目前唯一公開版本**不得**直接顯示本輪 OWNER 管理內容。新的私人/OWNER 真實部署及登入 UI 驗收、Google OAuth、安全 GAS HEAD 同步、PI 核准正式 Slots／研究者已簽完整 PDF、PI／研究行政 REC 適用結論仍無最新驗收證據。網站建置排程的即時 GET 在本輪不可用，不以歷史排程摘要冒稱本輪已重新回讀；未修改排程或 GAS。
- WRITE_OWNER=`solactw-star/study1-recruitment-e1-v1`，僅原新 V2 GitHub 程式／測試／進度最小增量；舊 Repo/GAS／原正式研究 Sheets／REC／RIF／正式資料、真人郵件、GAS HEAD、GAS 部署及真人收件均未更動。
- NEXT_ACTION：先依最新 main 接續 OWNER 真實報名與通知狀態的必要行政操作與本人端合成 E2E，完成未經核准資訊仍封鎖的私有安全路徑；GAS 來源同步／部署需獨立授權，正式 E1 開放仍須 PI/REC／核定場次／實際 UI 與另行核准。
- SYNC_STATUS：`MAIN_CODE_CI_VERIFIED=true`（限 `ebb35376fe70b55facfba9429a613509d9c9e3e8`）；`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`；`OPEN=false`、`CONSENT_READY=false`。


## 2026-11-13｜E1 真實交易逾時／UNKNOWN 安全接續：原來源唯讀與冪等修復（CI 待新 SHA）
- TASK_DOMAIN=`Study1_V2_E1_AMBIGUOUS_TRANSACTION_SAFE_RECOVERY`；SOURCE_ID/PATH=唯一 V2 GitHub `solactw-star/study1-recruitment-e1-v1` main；`docs/study1-system-spec.md` 最新適用 §70-S.34–36；SOURCE_VERSION/PRE_MAIN_SHA=`f7e6e43373319cd6396ed2c2088054f8a19ae2b6`。
- 跨檔案核對：`gas/Study1ParticipantIntake.js` 已在原 Applicants/Screenings+Verification 執行 E1 本人自陳／Email OTP；`Study1FormalBooking.js` 用原 Slots/Reservations 的 WZ_ HMAC 核對 HELD/CONFIRMED/UNKNOWN；`Study1FormalConsent.js` 原同意索引由 Email OTP/HELD/研究者預簽完整 PDF 核發；`AdminSandbox.js` 本人最後一簽完成後才獨立 finalize 原 Reservations，通知 outbox 先有 DISPATCHING 持久化後至多一次 MailApp，成功不宣稱送達。正式 `Study1Visitor.html` 必須先核對兩份來源才能顯示 CONFIRMED。
- FOUND_GAP_A：報名 POST 可能已寫入原 Applicants+Screenings，但回應逾時；前端先前只能請使用者聯絡研究團隊，重送單次 Turnstile token 又不安全。新增 `study1ParticipantBeginOutcome`，只接受原本人保有的高熵 requestId、同一姓名、Email、電話，在 ScriptLock 下以同一 HMAC 定位原兩表各唯一原列、兩次讀取核對；UNKNOWN／PARTIAL_UNKNOWN／SOURCE_MISMATCH 不冒稱成立，未執行 CAPTCHA replay／POST／寄信／寫入。正式前端失敗時只 GET 一次找回原 applicantId/screeningId，核對 PENDING_EMAIL 才允許接續；原 Email 已驗證但無一次性 proof 時禁止藉讀回重發 OTP。
- FOUND_GAP_B：原 HELD response-unknown 的 `study1FormalHoldOutcome` 以「目前發布 PDF 版本」衍生 WZ_，換版後即使原 HELD 已寫入也查無原因。新增**可選**原 HMAC 簽章 quote 唯讀參數，必須重核 applicant/screening/challenge、原 quote 全欄位、版本、quote HMAC、原 requestId，僅按簽署時的 docSHA/docVersion 定位原 Reservations；quote 即使超出 2 分鐘寫入時限也**只能用於 GET**，不能用於 HOLD POST。原 3 欄唯讀舊查核相容但不保證換版可找回；前端新請求始終帶原 quote，UNKNOWN 不自動補留。
- FOUND_GAP_C：原 `study1FormalConsentBegin` 已在私有索引提交 ISSUED 後回應遺失，原隨機 token 不能再取回，重發則 ALREADY_ISSUED。新增用原已驗證 Email proof、相同 HELD、原正式預簽 document sha/version、本人 160-bit requestId 和伺服器獨立 HMAC 衍生的**同一**未明文儲存 bearer；`study1FormalConsentIssueState` 只從原私有 registry 唯讀核對 tokenHash、原 applicant/challenge/reservation/slot 及版號後返回該同一尚有效 ISSUED token，不呼叫新寫入。同期 Begin 同 nonce 的回放僅當同一原索引時回傳 `readOnlyReplay`；不同 nonce、來源變更、已 CONFIRMED、逾期、他人或公開呼叫均拒絕／回報 UNKNOWN。前端丟失回應僅呼叫 GET，不重 POST。
- FAIL_CLOSED：公開 V2 仍須在任何身分或私有來源讀取前執行 `study1V2PublicRpcDeny_`。原 OTP used/EmailProof 丟失不可透過僅持有 applicant/requestId 绕過信箱控制權；真正 OTP 簽章、F:G 一次性使用與通知 MailApp 不更動。上述 recovery nonce 只保留於目前瀏覽器控制器記憶體，不寫入 localStorage，也不建立平行正式資料庫；若頁面重載遺失 nonce/憑證，仍須人工協助。
- TESTS：在既有 `tests/study1-participant-intake.test.cjs`、`tests/study1-formal-browser-synthetic-e2e.test.cjs`、`tests/study1-formal-v05-v08-original-booking.test.cjs`、`tests/study1-formal-v05-v08-browser-e2e.test.cjs`、`tests/study1-formal-consent-bridge.test.cjs` 增加證明部分寫入、錯本人與錯 nonce、跨 PDF 換版、HMAC 造假、已消耗 OTP、同意 registry 唯讀找回、拒絕再 POST、公開 fail-closed 的原離線負測。不刪減既有安全測試。
- LAST_VERIFIED_STEP=`CI_PENDING_NEW_SHA`；WRITE_OWNER=新 V2 GitHub `gas/`／既有 `tests/`／原 `docs/V2-MIGRATION-STATUS.md`，一次原子 main commit 後回讀對應 SHA CI；SYNC_STATUS=`OPEN=false`、`CONSENT_READY=false`、`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。
- BLOCKERS：遠端同一新 V2 GAS HEAD 未同步，真 Google 帳號 UI、PI 原 Slots/正式研究者預簽 PDF、REC 適用結果與真人營運仍須獨立核准及驗證；沒有更動舊 Github/GAS、正式 Sheets、REC、Script Properties、研究刺激或發送真人信件。
- NEXT_ACTION：回讀新 SHA CI、修復實際負測失敗；再獨立評估 OTP 驗證已消耗但遺失 proof 時如何在不放寬 OTP 驗證前提下由研究團隊安全核對，並驗證跨儲存簽署／Reservations status UNKNOWN 之人工處置。


### 2026-11-13｜同一 E1 UNKNOWN 續作的 OTP 已消耗狀態唯讀回查增量
- SOURCE/PRE_MAIN=`36acb568ba71c1b0a04b2127a3edf48759a71dc2`；Run #43408209076 Job #131827726032 對此基線回讀 `260 tests / 260 PASS / 0 FAIL / 0 SKIP`；不得以此舊 SHA 結果冒稱更新後 CI。
- FOUND_GAP：`study1ParticipantOtpIssueState_` 先呼叫只准 `Applicants=PENDING_EMAIL` 的共用 loader；原 Verification F:G 已使用、Applicants 已更新 `EMAIL_VERIFIED` 後，查詢 USED 會錯誤拒絕。
- COMPLETED：共用 `study1ParticipantOtpRows_` 僅新增顯式 `allowVerifiedReadOnly`；只在 `study1ParticipantOtpIssueState_` 使用，容許 `PENDING_EMAIL/EMAIL_VERIFIED` 查原來源；送信及一次性驗證仍須原 `PENDING_EMAIL`，沒有新 token、EmailProof、補寄或資料寫入。若 Applicants 已 EMAIL_VERIFIED 但 F:G 尚未使用，回傳錯誤 `OTP_ISSUE_LOOKUP_CONSUMPTION_INCONSISTENT`，防偽造可用。
- TESTS：原 `tests/study1-participant-intake.test.cjs` 增兩項負測：核實 F:G 一次性使用後 Applicants EMAIL_VERIFIED 仍可唯讀回 USED，且完全無新增信件／寫入；異常雙來源拒絕及仍不得再發同一 OTP。
- LAST_VERIFIED_STEP=`CI_PENDING_POST_OTP_FIX`；NEXT_ACTION=新 SHA raw CI 及 main/檔案回讀；`OPEN=false`、`CONSENT_READY=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`、`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`。


### 2026-11-13｜E1 UNKNOWN 安全恢復與 OTP 原列回查：程式 CI 已回讀（完成）
- TASK_DOMAIN=`Study1_V2_E1_AMBIGUOUS_TRANSACTION_SAFE_RECOVERY`；SOURCE_ID/PATH=`solactw-star/study1-recruitment-e1-v1` 的原 `main`、`docs/study1-system-spec.md` §70-S.34–36、本 `docs/V2-MIGRATION-STATUS.md`；MAIN_CODE_SHA=`2399259391882579a9c7b29ee96d6190e5db9ac9`。
- LAST_VERIFIED_STEP：最新修正程式 SHA `2399259391882579a9c7b29ee96d6190e5db9ac9` 與 GitHub Actions [Run #43409047252](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43409047252) 完整一致，Job `public-safety` #131830546888 原始日誌 `262 tests / 262 PASS / 0 FAIL / 0 SKIP`、`completed/success`。前一較早 SHA `36acb568ba71c1b0a04b2127a3edf48759a71dc2` 的 Run #43408209076 `260 PASS / 0 FAIL / 0 SKIP` 僅作歷史階段，不取代本程式 SHA。
- COMPLETED／跨檔案 E2E：原 E1 申請 POST 未知時以 `study1ParticipantBeginOutcome` 原 Applicants/Screenings GET、同一 requestId 與 HMAC 綁定核對並拒絕部分寫入，不重放 Turnstile；Email OTP 的 original Verification issue-state GET 對 `EMAIL_VERIFIED + used F:G` 仍唯讀回 `USED`，對 `EMAIL_VERIFIED + UNUSED` 拒絕矛盾來源，原 OTP 寄送及 verify 仍必須 `PENDING_EMAIL`。原 Reservations HELD 未知以同一伺服器 HMAC 簽章 quote 的原 SHA/版號定向 GET，即使 PDF 之後換版也不發第二次 HOLD；原同意 ISSUED 遺失回應則透過原 OTP/HELD/預簽 PDF 及同一高熵 nonce 找回同一 tokenHash，GET 不建立第二筆同意。簽署後原 Reservations CONFIRMED 及 Email Notifications outbox 至多一次處理的既有簽署呼叫鏈保留，沒有放寬不明結果重送。
- VERIFIED_BLOB_SHA：`gas/Study1ParticipantIntake.js=c9a383d1e5b5127fb917adb824b2441785e31a5f`、`gas/Study1FormalBooking.js=10b83ba71712da5a5bf9fa9a0724eaee2501ed94`、`gas/Study1FormalConsent.js=d26d8757e756b45ac6e3e3902b1bc05b148e5675`、`gas/Study1Visitor.html=005f61c8f378522ee8153968dc8313ff4351e50a`、`tests/study1-participant-intake.test.cjs=449c21e1c319895935bc064476b4c723d23c534f`。
- NEGATIVE_TESTS：既有 CI 全部保留；新增同原欄位結構的錯人、錯請求／HMAC、原 PDF 換版、過期、部分跨 Sheet 寫入、未消耗矛盾狀態、已消耗 OTP 重送禁止及前端不重 POST 檢查；沒有自動重送已提交的本人簽署或 MailApp。驗證僅限離線合成實例及本新 V2 GitHub SHA。
- BLOCKERS：本次未擅自修改任何正式 Sheets、REC、原 GAS Script、Script Properties、舊 GitHub／GAS 或真人收件；未取得新 V2 GAS 遠端 HEAD 同 SHA、私人及公開實際 UI、PI 核定原 E1 Slots／正式研究者預簽 PDF／適用 REC 結論，不能宣稱可真人操作。瀏覽器記憶體中的一次性 nonce 若因關閉頁面遺失或同意/OTP 時效已過，必須交研究團隊人工核對，不能自行核發新證明。
- WRITE_OWNER=唯一新 V2 GitHub；NEXT_ACTION：安全確認已簽 PDF／原 Reservations 結果不一致之 OWNER 人工唯讀恢復與錯誤狀態 UX；真 Email/Turnstile、GAS 同步與 UAT 各自依後續獨立權限；`OPEN=false`、`CONSENT_READY=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`、`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`。
- SYNC_STATUS：`MAIN_CODE_CI_VERIFIED=true`（限 `2399259391882579a9c7b29ee96d6190e5db9ac9`）；本純進度檔追加會建立更新的 docs-only SHA，其 CI 必須重新回讀，不能以舊 SHA 代替最新 SHA。


## 2026-11-13｜正式 E1 完整簽署 PDF 已保存但原 Reservations UNKNOWN：OWNER 安全預檢與人工冪等收尾
- TASK_DOMAIN=`Study1_V2_E1_SIGNED_PDF_BOOKING_UNKNOWN_RECONCILIATION`；SOURCE_ID/PATH=`solactw-star/study1-recruitment-e1-v1` 唯一正式 main；`docs/study1-system-spec.md` 最新 §70-S.34–36；`gas/Study1FormalBooking.js`、`gas/AdminConsole.html`、`tests/study1-formal-v05-v08-original-booking.test.cjs`、`tests/study1-owner-e1-operations-audit.test.cjs`、本原進度主檔；PRE_MAIN_SHA=`c2f51c3a50e154b2b17c6774a9ea8a821373954e`。
- 問題與依賴：原 `study1EConsentSignPdf` 於本人已核實的完整預簽原 PDF 補簽成功，私有 consent registry 與 PDF SHA 已 COMMITTED 後，才嘗試 `study1FormalFinalizeSignedE1Booking_` 的第二段獨立原 Reservations HELD→CONFIRMED CAS；跨兩儲存非 ACID，逾時可能發生寫後回應遺失，簽署成功不等於預約已確認。原 `study1OwnerE1ConsentBookingAudit`／`study1OwnerE1NotificationAudit` 只能分別看原預約與通知狀態，沒有同時核證**簽署證據＋原 HELD 可安全收尾**的 OWNER 介面。
- COMPLETED_BACKEND：沿用原 `study1FormalFinalizeSignedE1Booking_` 共用鎖、OWNER 權限、研究者預簽完整 PDF 來源、本人簽章與 CONFIRMATION 事件、兩個私有 SHA／ACL、原 Email OTP HMAC／原申請、核定原 Slots 與 double-snapshot 原 Reservations，新增 `PREFLIGHT` **只讀**模式，不建立新同意、PDF、預約或通知；僅對唯一且未過期 HELD 回 `REPAIRABLE_HELD`，對 CONFIRMED 回 `ALREADY_CONFIRMED`，對到期/取消回 `MANUAL_REVIEW_ONLY`，不宣稱 PDF 等於預約成功。明確拒絕非研究者預簽 E1 FORMAL 及同一原預約多份 FORMAL E1 同意的來源矛盾。
- SECURITY：新私有 OWNER-only `study1OwnerE1SignedBookingPreflight(consentId)` 返回與原完整 10 欄 Reservations 列、原 consent revision／token hash／PDF 版號與 SHA／HMAC binding 綁定的回執，不含個資及 PDF 位元組。新 `study1OwnerE1SignedBookingRepair({consentId,consentRevision,receipt})` **僅**在 OWNER 主動提交時以同一原 ScriptLock 再完整驗證，HMAC／revision／原列任一變動或 HELD 到期立即拒絕，否則只做原有一筆 HELD→CONFIRMED CAS 並寫後雙回讀；已 CONFIRMED 只能冪等唯讀回傳，沒有其他試圖補寫或撤銷 PDF、建立新預約、重簽與 MailApp 寄送。原參與者成功簽署後的既有一次性正式預約收尾流程維持；無法回讀或 CAS 不確定狀態禁止自動再次 POST。
- COMPLETED_UI：原 OWNER `gas/AdminConsole.html` 增設以指定完整簽署同意 ID 唯讀預檢的專區；伺服器返回 `REPAIRABLE_HELD` 後仍需獨立手動勾選，才可觸發**一次**收尾，點擊時立即在瀏覽器消耗預檢回執；若提交回應 UNKNOWN、原資料變動或未經完整核實，禁用按鈕、要求使用者重新唯讀查原 Reservations／Notifications，不重寄、重簽或宣稱送達。此操作僅對未來獨立核准的 PRIVATE OWNER 版本有效，現在的公開 `ANYONE/USER_DEPLOYING` 仍全部伺服器拒絕。
- NEGATIVE_TESTS：在原 `tests/study1-formal-v05-v08-original-booking.test.cjs` 將過期的事後研究員第二簽 fixture 更新為 §70-S.36 真正預簽 PDF+本人最後簽署原 SHA 模型，既有全部預約測試保留；新增正確 HELD 預檢不寫入、OWNER 明確單次修復、已確認冪等讀、偽造/過期 revision／receipt／原列／場次 SHA、EXPIRED/CANCELLED 不復活、公開及非 OWNER 拒絕、非預簽或破壞 SHA、同 reservation 多份同意拒絕、CAS 寫後回應遺失只能靠唯讀預檢找回。同 `tests/study1-owner-e1-operations-audit.test.cjs` 新增 UI 勾選／重選 ID 失效／逾時不重 POST／無 MailApp 的正負測。既有 CI 安全測試保留不刪不略。
- LAST_VERIFIED_STEP=`CI_PENDING_NEW_MAIN_SHA`；WRITE_OWNER=僅新 V2 GitHub 原 `gas/`、`tests/`、`docs/V2-MIGRATION-STATUS.md`；NEXT_ACTION=同一筆原子 main 提交後取最新 commit SHA、全檔 blob、完整 diff、同 SHA CI Job 原始日誌，修正所有真實失敗；通過後更新本進度原檔驗證紀錄。
- BLOCKERS：實際 V2 遠端 GAS、私人 OWNER UI、PI 核定真 E1 Slots／研究者預簽 PDF 與真人收件尚無本輪核可或 UAT 證據。本輪不存取或更動正式 Sheets、原同意 PDF／REC、任何舊 Repo／GAS、GAS 遠端 HEAD/部署、Script Properties、研究資料或真人郵件。
- SYNC_STATUS：`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`、`OPEN=false`、`CONSENT_READY=false`，CI 結果待相同新 HEAD 回讀。


- CI_REPAIR_2026-11-13：main `916e98f8ee00a1720053ef0139139e85392b467f` 的 [Run #43417083105](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43417083105) public-safety Job #131857576179 **274 tests／273 PASS／1 FAIL／0 SKIP**；唯一失敗為新增「錯 slot 來源不得手動收尾」負測僅接受 `DUAL_PDF|HASH_MISMATCH|IDENTITY_SLOT_CHANGED`，實際更早按完整 binding digest 回報 `FORMAL_BOOKING_CONSENT_SOURCE_CHANGED`（已正確在寫入前拒絕）。只將此合法安全錯誤碼加入原測試預期，未改生產程式、未略過負測；下一 main SHA 必須重驗，不以原失敗 SHA 冒充成功。


### 2026-11-13｜E1 完整簽署 PDF／原預約 UNKNOWN：本輪程式及負測同 SHA 回讀
- TASK_DOMAIN=`Study1_V2_E1_SIGNED_PDF_BOOKING_UNKNOWN_RECONCILIATION`；SOURCE_ID/PATH=新唯一 V2 `solactw-star/study1-recruitment-e1-v1`，主規格原 `docs/study1-system-spec.md` §70-S.34–36、進度原 `docs/V2-MIGRATION-STATUS.md`。
- SOURCE_VERSION/CODE_SHA=`4f0f9f0d9e37d229421721e1a2f2181317682955`；本輪最新完整原程式與測試 CI [Run #43417261068](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43417261068)、Job `public-safety` #131858197714 原始日誌回讀：`274 tests / 274 PASS / 0 FAIL / 0 SKIP`、`completed/success`。本記錄是文件附錄更新，會再產生 docs-only 新 main SHA，必須另以該新 SHA CI 回讀；不冒充 GAS 或真實 UI 驗收。
- VERIFIED_CODE_BLOBS：`gas/Study1FormalBooking.js=5d5d5d7bc400cec89bca893f8813ff3e4eff0896`、`gas/AdminConsole.html=f15fbb48dc4fdf2b782d3cc85f759d98de39a14f`、`tests/study1-formal-v05-v08-original-booking.test.cjs=07cefae3f1876fe4cadf94a2f19b32a4771e3cb4`、`tests/study1-owner-e1-operations-audit.test.cjs=1814fd055504bd62ecf83c629736abc3a9407e59`。主規格 `docs/study1-system-spec.md` 仍原 blob `b0e10c1ccbdd90a52693edbbe92c73f1408c0157`，未改需求或引入舊程式。
- LAST_VERIFIED_STEP：由原相同 ScriptLock 和獨立證據核實的 OWNER-only `PREFLIGHT`，返回 `REPAIRABLE_HELD`／`MANUAL_REVIEW_ONLY`／`ALREADY_CONFIRMED`，只在研究者預簽＋本人最終簽署 PDF 原 SHA/ACL/event、OTP、PI 原 Slots、原 Reservations 唯一列均有效時供人工操作。二階段 HMAC receipt 與原 consent revision+Reservations 全列 CAS 防競寫；未經人工操作不寫入；寫後結果 UNKNOWN 使用 OWNER 重新唯讀查原來源，禁止重送。因 §70-S.36 禁用非預簽歷史流程，FORMAL_E1 一律要求 `researcherPresigned=true`，同一 reservation 不得連結兩份正式同意。原 PDF、原研究者簽名／日期與舊系統皆未改動；通知 `NOT_SENT_BY_RECONCILIATION`，不代為寄送。
- NEGATIVE_TESTS：修正歷史離線 fixture 為唯一預簽完整 PDF＋本人最後一簽，新增簽署原來源、單次人工明確操作、逾時已寫入 CONFIRMED 的唯讀恢復、偽造／過時 HMAC/原列/revision、錯人錯 slot、雙重同意、撤銷/過期 HELD、非 OWNER／公版拒絕、UI 未勾選／變更 ID／UNKNOWN 不再 POST 等；保留全部既有安全負測。首筆 Run #43417083105 有 273 PASS／1 FAIL，純負測錯誤碼預期已修正，沒有改生產邏輯，最新同 SHA 274 全通過。
- WRITE_OWNER=唯一 V2 GitHub main。BLOCKERS：遠端 V2 GAS HEAD 未做來源同步／版本部署，現有私人 V1 不變；尚未完成真人 OWNER 受控 UI、PI 核定原 E1 Slots／研究者預簽完整 PDF、真 MailApp/Turnstile、PI／研究行政 REC 適用結論及真人營運授權。此修復是 GitHub 程式，不代表實際研究資料已修復或任何真人資料被確認。
- NEXT_ACTION：維持所有真人收件關閉；之後可在 V2 GitHub 離線測本人端 PDF 副本與 OWNER 綜合審核跨來源時間漂移；若未來單獨授權 GAS 同步/部署，須備份及完整回讀、真角色 UI/安全驗收，不能以此 CI 自行啟用收件。
- SYNC_STATUS：`MAIN_CODE_CI_VERIFIED=true`（僅 `4f0f9f0d9e37d229421721e1a2f2181317682955`）；`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`、`OPEN=false`、`CONSENT_READY=false`；`CONTEXT_SYNC_VERIFIED=false`（本輪沒有變更來源角色／研究上下文）。


## 2026-11-13｜V2 招募網站 Agent 工作指引增量（使用者要求繼續強化 Agent）
- TASK_DOMAIN=`Study1_V2_E1_AGENT_GUIDANCE`；SOURCE_ID/PATH=`solactw-star/study1-recruitment-e1-v1`／新增根目錄 `AGENTS.md`；正式網站規格仍為原 `docs/study1-system-spec.md`，網站唯一進度仍為本檔。
- SOURCE_VERSION/SHA：本輪開始已回讀 `main=604000024926c80d9500d50dc1b42d5e7d1a04be`，同版 GitHub Actions [Run #43417574558](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43417574558) `completed/success`；本輪新增 `AGENTS.md` commit `9fe2fef81564da2dbeb9d1913ac49b56b95b83d0`，Git blob `e833b6af5160d9d5ca4e686b2b12fb8ff8568c66` 已從原 `main` 重新下載確認。
- COMPLETED：新 `AGENTS.md` 僅提供 Agent 來源導航、授權與競寫流程、最新 SHA/同版 CI 核驗、E1 五項 MVP 優先與已完成成果不重做、資料不明不重 POST、舊 Repo/GAS 唯讀封存、GAS/版本/部署/真人 UAT 分離等操作指引；**不另立正式規格或研究規則**，不新增正式 GAS 執行來源。文件更新不代表模型權重已訓練，亦不代表每小時排程 prompt 已改；每輪 Agent 仍須主動讀取最新來源。
- LAST_VERIFIED_STEP：已確認 `AGENTS.md` GitHub 真實新檔、原檔 SHA、只更動該檔的提交 diff 及 `main` 指向 `9fe2fef...`；原程式基線 CI 274 tests／274 PASS／0 FAIL／0 SKIP；新增文件提交後未見同 SHA CI，**不得用舊 SHA 的 274 PASS 冒稱新 SHA 已驗證**。本進度文件新增後仍須回讀最後的 main 與 CI。
- WRITE_OWNER：唯一新 V2 GitHub；未讀寫舊 Github／GAS、遠端 V2 GAS HEAD、正式 Sheets、REC、研究個資、原研究者簽署 PDF、Script Properties；未同步 GAS、建立版本或部署、未傳送真人信件或啟用收件。
- BLOCKERS：現行遠端 V2 GAS 同 SHA source sync／私人 OWNER 和公版實際 UI 仍未核實；PI 核定 Slots、正式預簽 PDF、REC 適用性及真人營運授權不因 Agent 指引新增而成立。Automations 當輪讀取工具不可用，原每小時排程未變更也未重新驗證其 prompt。
- NEXT_ACTION：按最新 V2 main 由 Agent 增量檢視 E1 本人 PDF 副本／OWNER 同意、原 Reservations、Email outbox 的跨來源時間漂移與 UNKNOWN 人工處置，優先補安全負測及真實缺口；需要 OAuth、GAS 同步、部署或真人 UAT 時分別核對授權、備份及完整回讀，不重做已通過合成核心。
- SYNC_STATUS：`AGENT_GUIDANCE_GITHUB_READBACK_VERIFIED=true`；`MAIN_CODE_CI_VERIFIED=true` 僅指更新前 `6040000...` 程式基線，`AGENT_GUIDANCE_POST_DOC_CI_PENDING=true`；`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`、`OPEN=false`、`CONSENT_READY=false`。

- POST_DOC_CI_READBACK：新增 Agent 指引＋原進度主檔同一 SHA `e11c5035afb23a86f091746e7bb426311439779b` 的 [Run #43424915157](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43424915157)、Job `public-safety` #131883857667 原始日誌回讀 `274 tests / 274 PASS / 0 FAIL / 0 SKIP`，狀態 `completed/success`。本段屬文件回讀補記，後續最後文件提交 SHA 亦須另核對 CI；`AGENT_GUIDANCE_GITHUB_READBACK_VERIFIED=true`、`AGENT_GUIDANCE_CI_VERIFIED_ON_E11C=true`，不代表實際 GAS 同步、真 UI、排程 prompt 或真人收件已驗收。


## 2026-11-13｜V2 E1 已簽 PDF、原預約與通知 outbox 跨來源稽核增量
- TASK_DOMAIN=`Study1_V2_E1_PDF_RESERVATION_OUTBOX_CONSISTENCY`；SOURCE_ID/PATH=`solactw-star/study1-recruitment-e1-v1` 原 `main`，正式規格 `docs/study1-system-spec.md` §70-S.34–36 及原 `AGENTS.md`；PRE_MAIN_SHA=`143c12dd3c5506767dadf46997ea61e479bc9725`，基線 CI Run #43425055864 `274 PASS / 0 FAIL / 0 SKIP`。
- FOUND_GAP：原 `study1ParticipantBookingNotice_` 僅以同意索引 `CONFIRMED` 與原 Reservations `CONFIRMED` 等欄位准寄，未在寄送前重核原私人完整雙方簽署 PDF 位元組／SHA／ACL 和 SIGNATURE、CONFIRMATION 鏈；另 OWNER 通知 audit 在同一 reservation 綁兩份同意時使用迭代順序選第一個有效通知歸屬；OWNER 組合畫面未顯示出跨來源風險決策。
- COMPLETED（待同 SHA CI）：原 `gas/Study1ParticipantIntake.js` 只在原通知 MailApp/Notifications 之前，新增唯一同意歸屬、本人簽名與 researcher-presigned 事件鏈、同一 PDF ID/SHA、原 HMAC binding、私人已簽 PDF SHA／ACL 回讀及原 Reservations `confirmed_at_utc >= signedAt` 的 fail-closed 檢查；不更動原通知模板、重送或正式資料 schema。原 OWNER 唯讀通知稽核改成先計數重複 reservation，兩份均 `SOURCE_MISMATCH`，另拒絕寄件時間早於佇列時間。原 `gas/AdminConsole.html` 增加跨來源處置欄，區分同意索引與實際 PDF、預約未確認、撤回、通知未佇列／UNKNOWN／來源衝突／寄件服務接受非實際送達；僅唯讀，不觸發補寄或預約寫入。
- TESTS：增補原 `tests/study1-formal-notifications-outbox.test.cjs` 對失效私人 PDF SHA/ACL、偽造 SIGNATURE 事件、錯 PDF、錯 binding/版號、簽署／預約時間逆序、同一 reservation 雙同意的前置拒絕與零寫入／零寄送負測；原 `tests/study1-owner-e1-operations-audit.test.cjs` 驗證雙重歸屬全部 `SOURCE_MISMATCH`、通知時間倒置、UNKNOWN UI 狀態與不重送；保留全部既有測試及公版伺服器拒絕。
- AUTHORIZATION/WRITE_OWNER：僅新 V2 GitHub 原程式、既有測試與本進度檔一次原子 commit；GAS HEAD、版本／部署、舊 Repo／GAS、正式 Sheets、REC、PI 真場次／預簽 PDF、個資、真人信件及真人收件全部未操作。
- LAST_VERIFIED_STEP=`COMMIT_PENDING_CI`；NEXT_ACTION=回讀 GitHub 新 main SHA／變更檔案 blob 及同 SHA GitHub Actions public-safety Job 原始完整測試；任何失敗必須修正，不使用舊 SHA 假通過。正式 `OPEN=false`、`CONSENT_READY=false`、`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。

- CI_VERIFIED_POST_COMMIT_2026-11-13：唯一 V2 程式＋測試＋進度原子 commit `450a1fa96ea9823e8fda82791a18774bbdb1f230`；[GitHub Actions Run #43428724344](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43428724344)，Job `public-safety` #131896520965 原始日誌回讀 `280 tests / 280 PASS / 0 FAIL / 0 SKIP`、`completed/success`，涵蓋原 274 項及新增 6 項跨來源正／負測，無跳過、未刪測。原 main、五個變更路徑與 blobs 已回讀：`gas/Study1ParticipantIntake.js=8d47bf847b3e80151c767379a4b946b41d509e76`；`gas/AdminConsole.html=06c3154d9d81c861674b35c287b14c83053996ae`；`tests/study1-formal-notifications-outbox.test.cjs=c6fe8fe5ab5f47e3a5bb9ba9ed7a3c5fa2767174`；`tests/study1-owner-e1-operations-audit.test.cjs=fa9d3ce22adc91f98b364a8c721ad207be93bdee`；原進度 blob `bda84181ccd52322bd58ff6c9aa1d4c801fced5d`。本文件追加回讀後將另產生純文件 SHA，需再核對該 SHA CI。
- COMPLETED_STATUS：`MAIN_CODE_CI_VERIFIED=true`（嚴格限 `450a1fa...`）；本人 PDF 證據／OWNER 原索引／Reservations／Notification 的新防錯為 GitHub 程式級完成，**非**遠端 GAS 實際來源同步／私人 OWNER UI／正式 Sheets 實測。根據最新此輪 `GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`，`OPEN=false`、`CONSENT_READY=false`。下輪優先核對可重現的跨儲存原始來源漂移及已簽 PDF 但信箱實際未送達的人工處置；不得自動補寄或重新簽署。


## 2026-11-13｜V2 E1 OWNER 跨來源同鎖一致性增量（雙 RPC 時間漂移修復）
- TASK_DOMAIN=`Study1_V2_E1_OWNER_OPERATIONS_SAME_LOCK_AUDIT`；SOURCE_ID/PATH=唯一新 V2 `solactw-star/study1-recruitment-e1-v1` 原 main／`AGENTS.md`／`docs/study1-system-spec.md` §70-S.34–36；PRE_MAIN_SHA=`cb16af3e9f61b4d27c2dba0ae105102c99d54f03`（上輪同 SHA CI Run #43428872631 `280 PASS / 0 FAIL / 0 SKIP`）。
- FOUND_GAP：原 `AdminConsole.html` 的 OWNER 操作表分別呼叫 `study1OwnerE1ConsentBookingAudit` 與 `study1OwnerE1NotificationAudit`；每個 RPC 各自加鎖、讀同意索引，相同 consent revision 與 ID set 仍無法排除兩次 RPC 之間原 Reservations、Slots 或 Notifications 變動。原通知來源已個別雙讀，但未與原預約和同意索引置於同一鎖的共同再驗證窗。
- COMPLETED（待同 SHA CI）：僅新 V2 `gas/Study1FormalBooking.js`、`gas/Study1ParticipantIntake.js` 將原各自純投影抽為共用唯讀 helper，保留既有獨立 OWNER RPC；新增私有 OWNER-only `study1OwnerE1OperationsAudit` 單一 RPC：公開版 deny-before-reads、OWNER 權限、單一 ScriptLock、原 Consent registry 兩次完整 revision/records 讀取、原 Slots/Reservations 各自 double snapshot 並跨兩次比對完整 headers/rows、Notifications 每次 metadata+雙讀並跨兩次比對 rowCount/全列、結束鎖狀態檢查；同一 asOfUtc 與唯一同意 ID 集合投影兩份結果，來源漂移、缺欄／來源失效或競寫立即 fail closed，絕不回傳拼接式確定狀態。原 `gas/AdminConsole.html` 改只呼叫此單一 RPC，驗證聯合回執、版號／IDs 後才呈現原預約與通知，UNKNOWN 不觸發 POST、寄信、補寄或簽署。
- LIMITATION：共同 ScriptLock 約束本 GAS 協作寫入者，並以重讀偵測外部來源可觀察的前後差異；此非跨 Google Sheets 與 Script Properties 的資料庫 ACID 原子快照，無法保證外部無鎖寫入在最後讀取之後或 ABA 變動。所有原運作資訊仍為唯讀確認點，不直接授權真人營運。
- TESTS：在原 `tests/study1-owner-e1-operations-audit.test.cjs` 保留既有 standalone/outbox/OWNER 人工修復測試，增同鎖單 RPC 完整來源成功、相同 revision 但原預約／原 slot 差異、通知狀態／新增列／雙讀間變化、同 revision consent 內容異動／revision 變更、格式與鎖失效、公版與非 OWNER 拒絕、前端不接受未核實聯合回執；全部合成來源，確保無正式 Sheet 寫入、MailApp、非冪等重送。
- WRITE_OWNER：唯一新 V2 GitHub 的原 GAS、原 tests、原進度主檔，競寫以最新 main SHA 確認並採單一原子 commit；不觸及舊 Repo／GAS、遠端 V2 GAS、正式 Sheets／REC／PI 原場次、研究資料、個資、本人簽署 PDF，無真人信件或收件。
- LAST_VERIFIED_STEP=`COMMIT_AND_CI_PENDING`；NEXT_ACTION：提交後回讀 main/tree/受影響 blob、同 SHA public-safety Job 原始日誌，任何紅燈先修正真實原因，絕不跳過測試；最新檔案更新造成新 SHA 時再核驗同 SHA CI。
- BLOCKERS/SYNC_STATUS：這是離線 GitHub 程式與合成測試，`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`、`OPEN=false`、`CONSENT_READY=false`。遠端 OAuth、PI／REC 適用及真 Google 帳號 UAT 仍非本輪授權。

- CI_REPAIR_2026-11-13：第一筆程式與進度原子提交 `f65f79c572e6e6673f7583975a0142bdac503ac4`、[Run #43430184684](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43430184684) 為 `287 tests／282 PASS／5 FAIL／0 SKIP`；失敗集中在離線雙源 VM harness：載入實際 `Study1FormalBooking.js` 蓋掉合成 `study1FormalSnapshot_`，導致測試找不到 `bookingReadOnlySnapshot_`。未改正式 GAS 核心／削減負測，只在原 `tests/study1-owner-e1-operations-audit.test.cjs` 的 VM 載入後恢復合成 snapshot 與 validation stub。修復 commit `0905cce49608c3eef868d5f6171a7ec99191c744`。
- CI_FINAL_OWNER_SAME_LOCK_2026-11-13：修復後相同 `main=0905cce49608c3eef868d5f6171a7ec99191c744` 對應 [GitHub Actions Run #43430288711](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43430288711)、Job `public-safety` #131901785312 原始完整日誌回讀 `287 tests／287 PASS／0 FAIL／0 SKIP`、`completed/success`。新增 7 項正負測包含同鎖單 RPC 成功、相同 Consent revision 下原 Slots/Reservations、Notifications 原列／筆數、consent 内容／版號、雙讀變動、schema/lock、公開／非 OWNER 拒絕及 UI 非同鎖回執拒絕；既有 280 項全部保留。第一筆失敗 SHA 不冒充成功。
- LAST_VERIFIED_STEP=`MAIN_CODE_CI_VERIFIED_ON_0905CCE=true`；這次追記將形成最新 docs-only commit，須另外核對新 main SHA CI 才能稱最終同版通過。新增單鎖及雙重回讀仍只能偵測可觀察差異，非跨資料庫 ACID；不執行真人資料變更、不寄真人信。 `GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`、`OPEN=false`、`CONSENT_READY=false`。


## 2026-11-13｜V2 OWNER 手動異常處置：外部競寫／ABA 觀察限制與 UNKNOWN 防再 POST
- TASK_DOMAIN=`Study1_V2_OWNER_MANUAL_EXCEPTION_HANDLING`；SOURCE_OWNER=新 V2 GitHub `solactw-star/study1-recruitment-e1-v1`；正式網站主檔 `docs/study1-system-spec.md` §70-S.34–36；工程指引 `AGENTS.md`；SOURCE_VERSION/PRE_MAIN_SHA=`d99a309474dd70bbdd959e62d13eb6f1ef1c580d`（當輪回讀對應 [CI Run #43430522602](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43430522602)，287 tests／287 PASS／0 FAIL／0 SKIP）。
- 來源核對：唯一原 `gas/Study1FormalBooking.js` 的 `study1OwnerE1OperationsAudit` 已採同一 ScriptLock 雙讀 consent、Slots/Reservations、Notifications，但外部無鎖 A→B→A、完成觀察後寫入不能被當時雙讀證明不存在；`gas/AdminConsole.html` 原人工預約收尾遭未知 POST 回應後，操作者可再次 `PREFLIGHT`，若仍 HELD 便重新取得可提交狀態，造成同一頁人為重 POST 風險。OWNER 組合畫面未醒目註明觀察時點，人工預檢啟動後舊表仍可見。
- COMPLETED（待新 SHA CI）：原 `gas/Study1FormalBooking.js` 唯讀聯合回執明確回傳 `actionAuthority=NONE`、`externalWriterGuarantee=false`，不冒稱跨 Google Sheets／Script Properties ACID 或保證外部不存在變更。原 `gas/AdminConsole.html` 嚴格要求此兩值才渲染，顯示原始 UTC 觀察時間、已簽 PDF／OTP／原預約及 Notifications 人工查核提示；不據此表授權任何寫入、寄信或重簽。啟動個案 `PREFLIGHT` 或單次人工收尾時，使上一份聯合觀察結果失效，禁止操作者用舊 CONFIRMED 畫面推定現況。
- UNIQUE_POST_FAIL_CLOSED：在原人工 UI 原地新增本頁每份 consentId 的 `submitted` 防再 POST 鎖存；在任何 `study1OwnerE1SignedBookingRepair` 首次提交前標記（無論成功、逾時、網路 UNKNOWN、回應無效），後續對同一 ID 可再唯讀查原來源但**不得再提交第二次**，即使新的預檢再次呈現 `REPAIRABLE_HELD`。這是單頁補強而非跨瀏覽器／重載的持久鎖，伺服器仍保留原 receipt／revision／Reservations CAS；不新增第二個正式資料庫／個資或 SessionStorage。預檢 RPC 送出後如輸入 ID 發生變更，即使改回同 ID，舊非同步回應也作廢。
- NEGATIVE_TESTS：在原 `tests/study1-owner-e1-operations-audit.test.cjs` 增合成外部 A→B→A 雙讀不可見／最後讀取後變動，斷言只觀察且無任何操作授權；同一 ID UNKNOWN 後再預檢不重 POST、成功回應後同 ID 仍鎖住、輸入 ID 往返導致遲到的 PRELIGHT 回應作廢、舊聯合表在個案人工處置時清除，以及聯合回執缺 `actionAuthority=NONE` 或自稱外部保證即拒絕。既有負測、公版 deny-all、真人信件零發送保留，不刪減、不跳過。
- AUTHORIZATION/CONCURRENCY/WRITE_OWNER：限唯一新 V2 Repo 既有 `gas/Study1FormalBooking.js`、`gas/AdminConsole.html`、`tests/study1-owner-e1-operations-audit.test.cjs` 與本正式接續主檔。採原 main lease／原子 commit、回讀同 SHA CI。**未**觸及舊 Repo／舊 GAS、遠端 V2 GAS、PI 核定原場次、正式 Sheets、REC、已簽研究者 PDF、Script Properties、研究個資及真人 Email。
- LIMITATION：本頁防再 POST 在重新開頁、換裝置或外部行動者仍需依原來源、獨立核對與伺服器 CAS 管理；共同 ScriptLock 不能防外部無鎖競寫或 ABA，合成 CI 不代表營運實例一致。
- LAST_VERIFIED_STEP=`CI_PENDING_NEW_MAIN_SHA`；NEXT_ACTION=提交後核對變更檔 blob／diff／原最新 main SHA，同 SHA 原始 GitHub Actions job 正／負測，失敗即修復；在執行任何真操作前另需 OWNER 實際 UI、PI／REC 適用與獨立授權。
- SYNC_STATUS：`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`、`OPEN=false`、`CONSENT_READY=false`；這是 GitHub 程式／離線測試，不會同步 GAS、部署、寄信、收件或修改正式研究資料。

- CI_FINAL_OWNER_UNKNOWN_2026-11-13：本輪唯一 V2 main 原子提交 `6770747ad1e1b36497327067c629a48288e54346`，僅涉及原 `gas/Study1FormalBooking.js`、`gas/AdminConsole.html`、`tests/study1-owner-e1-operations-audit.test.cjs`、本原進度檔；[Actions Run #43433982078](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43433982078)／Job `public-safety` #131914275564 同一 SHA 原始日誌：`292 tests / 292 PASS / 0 FAIL / 0 SKIP`，`completed/success`，原 287 項保留。新增五項合成安全負測全部 PASS，並對多筆舊測試增加回執非操作授權檢查。GitHub main／commit diff／原檔完整回讀確認：`gas/Study1FormalBooking.js` blob `d0877aeacdd3ec9b843f66fe92c4242f086b4414`；`gas/AdminConsole.html` blob `eb22565905ed05ff06fbde62332b9304b19d5d60`；`tests/study1-owner-e1-operations-audit.test.cjs` blob `7dce860e88d553880f9172de455bf2a229c70829`；本原進度檔更新前 blob `ef9cd30c8f27f9d0b0169ba76d2fee5a41a75463`。本進度追加後是純文件新 SHA，仍須單獨回讀最新同 SHA CI。
- COMPLETED／BLOCKERS：OWNER 預約人工收尾 UI 現為單頁／每個 consentId 至多一次提交，遇 UNKNOWN 仍可唯讀但不能再 POST；原來源不同步、外部 ABA／後寫入只給當次觀察、非授權。真正跨瀏覽器 durable 防重複仍取決於原權威 Reservations 的 receipt/revision/CAS 及人工核對，不能宣稱一次查核就具 ACID 原子性；`MAIN_CODE_CI_VERIFIED_ON_6770747=true`（限此程式提交）。不具實際 V2 GAS 同 SHA 同步、私人 OWNER／公開真 UI、PI／REC 適用與真 MailApp 證據。本輪未改遠端 GAS、正式 Sheets、PI／REC、個資、舊系統或真人收件，`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`、`OPEN=false`、`CONSENT_READY=false`。


## 2026-11-13｜本人已簽 E1 PDF 的回應遺失／本人副本／原預約 UNKNOWN 恢復與 OWNER 跨來源離線驗收
- TASK_DOMAIN=`Study1_V2_E1_PARTICIPANT_SIGNED_PDF_RECOVERY`；SOURCE_OWNER=唯一新 V2 GitHub `solactw-star/study1-recruitment-e1-v1`；SOURCE_ID/PATH=`docs/study1-system-spec.md` §70-S.34–36、原 `AGENTS.md`、`gas/Study1Visitor.html`、`gas/AdminSandbox.js`、`gas/Study1FormalBooking.js`、`gas/Study1ParticipantIntake.js`、`gas/AdminConsole.html`、`tests/study1-formal-v05-v08-browser-e2e.test.cjs`、`tests/study1-owner-e1-operations-audit.test.cjs`、原 `docs/V2-MIGRATION-STATUS.md`；PRE_MAIN_SHA=`1e97d90bc39569fe261c64dadd1b5a6d7b3ee764`，CI Run #43434247081 原始日誌基線 `292 tests / 292 PASS / 0 FAIL / 0 SKIP`。
- FOUND_GAP：本人 `study1EConsentSignPdf` 已成功保存完整研究者預簽＋本人手寫 PDF，但回應遺失時前端原本只顯示一般 RPC 失敗、簽署按鈕不具明確一次性安全 latch，且沒有主動以本人既有 bearer 唯讀查原同意索引；原 `formalConsentCopy_` 在 PDF bytes/SHA 已核實後再查獨立 `study1FormalStatus`，若該 GET 逾時，顯示一般錯誤而未向本人展示完整 SHA 已核實的 PDF 與預約 `UNKNOWN` 結果頁。原已簽結果頁亦無直接的 `Reservations` 唯讀重新查詢。
- COMPLETED_FRONTEND（新 V2 GitHub）：原 `gas/Study1Visitor.html` 在本人提交簽署 POST 前本頁標記 `formalSignSubmitted`，已提交的同一 session 不再讓參與者重簽；逾時、錯誤或不合格的提交回應，立即只讀 `study1FormalConsentStatus`；只有原同意索引確實 `CONFIRMED` 且 `copyAvailable` 時才使用原 `study1EConsentSignedPdfCopy` 取得原私人 PDF bytes／完整 SHA／臺灣簽署日期；不得重新執行簽署 POST。原完整 PDF 一旦 SHA 驗證通過，在獨立原 `Reservations` GET 失敗、HELD、缺證據、UNKNOWN 時仍安全保留本人下載連結並展示獨立 `UNKNOWN`／`HELD` 結果，絕不從 PDF 推導原預約 CONFIRMED。結果頁新增 `formalDoneRefresh`，只以既有本人 EmailProof 查同一原預約列、不寫預約或寄信；回傳經驗證的原 CONFIRMED 才能顯示正式確認。恢復流程採 session 內已驗證 PDF SHA/context 與 epoch 檢查，防止舊非同步回應覆蓋新本人的下載／預約狀態。回到原同意頁可唯讀重取完整副本；沒有持久化 token、姓名、身份或正式資料至瀏覽器 storage。
- OWNER_AND_OUTBOX_INTEGRATION：沿用已通過的單一 `study1OwnerE1OperationsAudit` 同鎖雙讀原 Consent/Slots/Reservations/Notifications 的既有私人唯讀 RPC；在原 `tests/study1-owner-e1-operations-audit.test.cjs` 加入相同正式同意已確認但原預約仍 HELD／已取消、通知 outbox 空白，及原預約 CONFIRMED 但通知 UNKNOWN 的整組合成場景；確認 OWNER 聯合查核結果不冒稱預約／送達、`actionAuthority=NONE`、`externalWriterGuarantee=false`，全程不對任何正式來源寫入或寄信。
- NEGATIVE_TESTS：在原 `tests/study1-formal-v05-v08-browser-e2e.test.cjs` 增本人簽署「寫後回應遺失」只 GET 不重 POST、「寫前失敗」嚴守一次提交、回應不合法只讀核對、簽署 PDF SHA 變造不得顯示下載或確認、原 Reservations 查詢失敗須顯示可下載原 PDF 及 UNKNOWN、原預約由 HELD 變 CONFIRMED 僅透過新獨立 GET 顯示等 6 個場景；原 OWNER 檔增 3 個跨來源場景；保留原有 292 項和公版 deny-all、正負測，不略過、不刪減。
- LIMITATIONS：這是離線合成來源與 GitHub 程式級恢復，瀏覽器 session 結束後既有 bearer/EmailProof 不會被保存，重新載入或換裝置仍需研究團隊另行核對；單一 GAS ScriptLock + double read 並非可防所有外部無鎖寫入、ABA 或跨儲存 ACID。未宣稱真人本人的 PDF 真實保管權或實際通知送達。
- WRITE_OWNER=僅唯一新 V2 GitHub 現有 `gas/`、原 `tests/`、原進度主檔；LAST_VERIFIED_STEP=`PENDING_NEW_MAIN_SHA_CI`；NEXT_ACTION=同一 main 原子提交後取得最新原完整 tree／blob／diff，執行受影響正負測與公版安全 CI，按同一 SHA 原始日誌修正所有失敗，再回填成功紀錄。未做遠端 V2 GAS HEAD 同步、版本建立、部署／真人 UI UAT、正式 Google Sheets/REC/PI PDF 的任何寫入或真人信件。
- BLOCKERS：PI 核定 E1 Slots、研究者預簽正式 PDF／REC 適用核實、真 Google 帳號及 Chrome 本人／OWNER UI、實際 V2 GAS 同版同步與安全部署未取得本輪授權及回讀。SYNC_STATUS：`OPEN=false`、`CONSENT_READY=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`、`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`；不要以本次合成 CI 冒稱正式營運驗收。


- CI_REPAIR_2026-11-13：首筆 SHA `88311daf941f11baf7aad3792f286d8309696c55` 的 [Run #43438587027](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43438587027)、Job #131930016411 原始日誌 `301 tests / 297 PASS / 4 FAIL / 0 SKIP`。兩項舊靜態斷言仍要求原 `study1FormalStatus` 直接內嵌於 PDF callback；現改成可按鍵唯讀重查的 `formalReceiptRefresh_`，因此在原測試增驗新的 GET/UNKNOWN fallback/SHA 驗證，而未刪安全檢查。另兩項 OWNER 新合成測試將 revision=7 的原 registry 投入預設 revision=4 的前端 mock，原前端嚴格拒絕混版是正確結果，測試改為同 revision 證據。生產安全條件無更動；需新 SHA CI 回讀。


### 2026-11-13｜E1 本人已簽 PDF 副本＋原預約 UNKNOWN 恢復：同 SHA CI 最終回讀
- TASK_DOMAIN=`Study1_V2_E1_PARTICIPANT_SIGNED_PDF_RECOVERY`；SOURCE_ID/PATH=`solactw-star/study1-recruitment-e1-v1` 最新受影響原程式／測試／本主進度檔；SOURCE_VERSION/CODE_SHA=`2af666a10322add246405902a32232275a84846c`。
- LAST_VERIFIED_STEP：新本人端安全恢復及 OWNER 跨來源整合程式在原 `main` 頂層 SHA `2af666a10322add246405902a32232275a84846c` 的 [GitHub Actions Run #43439156271](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43439156271)／Job `public-safety` #131931922887 完整原始日誌 `301 tests / 301 PASS / 0 FAIL / 0 SKIP`、`completed/success`。原 292 項全部保留；新 6 項本人端合成、3 項 OWNER/Reservations/Notifications 跨來源合成測試全通過。先前初版 SHA `88311daf941f11baf7aad3792f286d8309696c55` Run #43438587027 `301 tests / 297 PASS / 4 FAIL`，兩項文字斷言依賴舊內嵌 callback，兩項合成來源 revision=7 與 mock 預設 revision=4 不一致（嚴格拒絕正確），僅修測試結構及同版來源；沒有放寬公版、OWNER 或同意安全條件。
- VERIFIED_BLOBS：`gas/Study1Visitor.html=2c9e7806e7652d45574464e799e3d10b5101953e`，`tests/study1-formal-v05-v08-browser-e2e.test.cjs=ec815cdf44cd478163ae30fdb6616351d40797e0`，`tests/study1-owner-e1-operations-audit.test.cjs=652ee15a51a1624c0cca74d7f2e5ae4f01d89b8d`，`tests/study1-formal-intake-wizard.test.cjs=c6791987c8f4391c5bbff0896ed7b93bd9c4e004`。原正式網站主規格 blob `b0e10c1ccbdd90a52693edbbe92c73f1408c0157` 無更動，完整程式／測試 source 回讀通過。
- COMPLETED：本人簽署提交遺失以同一 session 既有原同意 bearer 唯讀 `study1FormalConsentStatus` → 正式完整簽署 PDF 原 bytes/SHA/臺灣日期 `study1EConsentSignedPdfCopy`；同一 session 簽署只 POST 一次。PDF 已驗證即保留完整下載，Reservations GET 失敗也展示 `UNKNOWN`，不可誤顯 CONFIRMED；可再次唯讀查同一原本人 Reservations，在唯一原列狀態確認後更新顯示，無預約、重簽或通知 POST。OWNER 的既有同鎖跨來源稽核在新增三組合成場景中區分已簽索引／原 HELD 或取消／未入 outbox，以及已 CONFIRMED／寄件 UNKNOWN，行為 `actionAuthority=NONE`、`externalWriterGuarantee=false`、無 MailApp／正式來源寫入。
- LIMITATIONS：新的本人安全恢復只在同一仍開啟的 session 中保留既有 bearer、EmailProof、驗證結果及已簽 PDF Blob；若使用者關閉瀏覽器、重載或跨裝置而遺失憑證，仍須研究團隊依正式程序另行安全核對，不從同意 ID、Email 或已使用 OTP 自動恢復任意私有文件。OWNER 合成 source 並非真 Google API／MailApp，雙讀原來源不能防外部無鎖競寫/ABA 或視為 ACID。此 CI 僅證明 Github 程式離線安全測試通過，不等於正式部署、私人 OWNER UI 與參與者 UI 驗收。
- WRITE_OWNER=唯一新 V2 GitHub `gas/Study1Visitor.html`、既有三個 tests、原 `docs/V2-MIGRATION-STATUS.md`；NEXT_ACTION=評估本人換裝置／重新載入後的本人可信身分恢復與可否不開新 OTP 的人工程序，優先確認 PI／REC 適用；或者優先處理授權 V2 GAS 同 SHA source sync 前的安全審查與 PI 核定 Slots／正式預簽 PDF 清單，但沒有另行授權時僅唯讀不寫 GAS。
- BLOCKERS：新 V2 GAS HEAD、版本與部署未在本輪同步／驗證；正式 PI Slots、受保護預簽 PDF/REC 適用結論、真人 Google 登入雙角色 UI、真人信件 outbox／送達均無本輪完成證據。 `OPEN=false`、`CONSENT_READY=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`、`GAS_PUBLIC_SOURCE_SYNC_VERIFIED=false`、`PUBLIC_DEPLOYED=false`、`PUBLIC_UI_VERIFIED=false`。本文件追記為 docs-only commit，須另回讀新 main SHA 的同版 CI，勿拿舊 SHA 冒充成功。

## 2026-11-15｜E1 私人 OWNER 後台不可達：唯讀候選與公版隔離
- TASK_DOMAIN=`Study1_V2_E1_OWNER_PRIVATE_REACHABILITY`；SOURCE_OWNER=唯一新 V2 GitHub；SOURCE_ID/PATH=`docs/study1-system-spec.md` §70-S.34–36、`gas/Website.js`、`gas/appsscript.json`、原 `gas/AdminConsole.html`／三個 OWNER server 檔、`scripts/study1-v2-gas-head-only.cjs`、原測試及本進度檔。PRE_MAIN_SHA=`532367b876978e5d4980f764d1cb0bfb08404c2d`。
- LAST_VERIFIED_STEP=原 main [Run #43525780981](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43525780981)／Job #132231045864 原始日誌 `304 tests / 304 PASS / 0 FAIL / 0 SKIP`，含三項 lost-browser safety guards；本輪新提交 CI 另待回讀。
- FOUND_GAP：現行 GitHub manifest=ANYONE/USER_DEPLOYING，Website.doGet 對 admin/team/preview/demo 一律拒絕，敏感 RPC 也公版 deny-all。這是公開唯讀授權的正確保護，不是只換 URL 或同步 HEAD 可修的私有後台。歷史私人 version 1 不可當最新 OWNER 原程式驗收。
- COMPLETED（候選）：原 HEAD-only 安全腳本新增純離線 `privateOwnerReadOnlyCandidate(files)`，從完整原公版清單生成同一 Script 的 MYSELF/USER_DEPLOYING 私人唯讀來源候選；只允許 OWNER 身分雙核對的 admin HTML 與六個原有讀取 RPC（場次、PDF 目錄／已簽索引／原副本下載、聯合預約與通知、撤回查核）。原公版 gas/ 不變；所有寫入、寄信、真人報名／簽署、修復 POST、測試／Demo RPC 保持拒絕，候選隱藏其 UI，不自動讀取 sandbox。候選必須無法通過原 ANYONE 公版防護。本函式不接入既有 main()/HEAD-only audit、prepare、apply 或任何部署工作流；不自動將候選寫入 GAS。
- TESTS：新增原既有 HEAD-only 測試，包含基線不變、MYSELF／ANYONE 誤用拒絕、來源漂移、OWNER route 正向、非 OWNER/身分遮蔽負向、六項讀 RPC 在來源前拒絕及敏感寫入保持關閉；實際 CI 結果須按新 SHA 記錄。原安全測試保留。
- BLOCKERS：仍需取得新提交同SHA CI，另明確核准唯一 V2 GAS 私人來源、備份／比較／回讀、版本與部署。此候選僅用於先解除管理查閱/UAT 入口阻塞，不代表可完成 PDF 上傳選用、正式場次寫入、真人報名預約。後續依實際 UAT 與適用 PI/REC 授權，逐步開放既有 E1 OWNER 必要操作，不擅自設定原始資料或擴大公開版權限。
- NEXT_ACTION=同版 CI 驗收；若通過且繼續獲授權，集中完成同 V2 Script 私人 MYSELF 來源同步/不可變版本、OWNER 登入及六項唯讀功能真 UI。獨立公開唯讀版原路徑維持；正式 E1 收件須另外核准完整 participant release 與 PI/REC/場次/PDF/Email/權限驗證。
- WRITE_OWNER=唯一新 V2 GitHub 三個既有原路徑；SYNC_STATUS=`CI_PENDING`，遠端 GAS/版本/部署/真人 UI/正式資料/收件本輪未執行，`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`；未觸及舊 Repo/GAS、RIF 或 E-Prime。

### 2026-11-15｜私人 OWNER 唯讀候選：同版 CI 回讀完成
- SOURCE_VERSION/CODE_SHA=`9cb521f03fcddbd976aff3d714ae691e8bf2993b`；[Run #43705006821](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43705006821)，Job #132784091506 `completed/success`，完整日誌核對 checkout 同 SHA，`306 tests / 306 PASS / 0 FAIL / 0 SKIP`；兩組新測試（私有候選僅六項讀 RPC 改變與 MYSELF/ANYONE 隔離；OWNER route 與非 OWNER 讀取前拒絕、寫入仍關閉）均 PASS。原 304 項保留。
- VERIFIED_BLOBS：`scripts/study1-v2-gas-head-only.cjs=5148fac1f3a577a2679b8f26fb1b1c9322f3395a`；`tests/study1-v2-gas-head-only.test.cjs=135ebaadf56186c61acd4274b00ac57c10729137`；原公版 gas/ 未改，三檔原子 commit/lease/main 已回讀。
- LAST_VERIFIED_STEP=`MAIN_PRIVATE_OWNER_CANDIDATE_CI_VERIFIED_ON_9CB521F=true`。候選產生器僅離線、不連入原部署/HEAD 寫入流程；未部署、未開放資料寫入、未對正式資料執行讀寫 UAT。NEXT_ACTION=先核對同一 V2 GAS 的現存私人版本與公開版及來源差異；另取得私人候選來源同步／建版／部署的具體授權與安全備份、競寫檢核，再作 OWNER 六項真 UI 驗收。正式 E1 報名/預約/同意寫入、PI/REC、真人收件仍獨立阻塞。此追記若為 docs-only 新 main，CI 須獨立回讀；不得將 306 PASS 冒稱 GAS 或營運驗收。

## 2026-11-15｜E1 私人 OWNER 正式預簽 PDF 管理候選
- TASK_DOMAIN=`Study1_V2_E1_OWNER_PDF_MANAGEMENT`；SOURCE_ID/PATH=唯一新 V2 Repo 原 HEAD-only 來源腳本、原 PDF UI/來源安全測試、原進度檔。PRE_MAIN_SHA=`f2f3cd9dc43c0c93515711fea700b103675cfa54`，原 Run #43705073795 同 SHA 306 PASS。依 §70-S.34–36 不改公版 gas/、不新增正式資料來源。
- FOUND_GAP：最新唯讀候選六個 OWNER 讀 RPC 已可生成，但原 PDF 上傳／選用／受保護來源設定仍被公版 gate 拒絕，現存私人部署工具仍鎖定舊 32 檔 SHA `73dea801154abbe847863a07df2e623fc1d68622a4442f006d1be7473dd5a0f7`。最後可取得遠端唯讀 Audit Run #43205689864（2026-11-12）、Job #131140151323：當時 version 1、兩個 deployment（HEAD＋version 1），MYSELF/USER_DEPLOYING；不能當現時遠端狀態。當前 connector 無 GAS GET 或 workflow dispatch；最新遠端狀態未驗。
- COMPLETED（離線候選）：新增 `privateOwnerManagementCandidate(files)` 沿用已完成六個讀 RPC 及私人 route，僅新增原三個 E1 預簽 PDF 管理 RPC，還原必要 UI；伺服器維持 OWNER active/effective、closed flags、原鎖、revision、MIME/bytes/SHA/PRIVATE/父來源驗證與回讀。限制上傳及設定來源 E1 預簽、選用 E1 預簽，禁 E2／null pointer／非預簽；已一致的來源指標亦須重新驗原完整 PDF。UNKNOWN 後本頁即使 GET 成功仍鎖定寫入，保留人工核對；不是跨瀏覽器 durable idempotency。公版仍 deny-all，修復預約、撤回寫入、測試設定、真人報名／OTP／簽名／寄件均拒絕；候選不得通過公版 guard。
- TESTS=保留原 306 個，新增候選／E1 範圍、OWNER 與原來源及 UNKNOWN 負測；CI 輸出候選來源 SHA。未實際上傳或操作正式資料。候選純離線，不接入原 deploy 或 HEAD apply。舊部署腳本與舊 32 檔測試不擅自更換歷史 SHA；下一步須準備同 V2 Script 的新版唯讀 inventory 與精確 candidate SHA 綁定發布路徑，再另授權 HEAD 同步、建版、部署。
- WRITE_OWNER=唯一新 V2 GitHub 四個原路徑；LAST_VERIFIED_STEP=`NEW_CI_PENDING`；BLOCKERS=遠端 GET/dispatch、原部署工具過期、正式 PDF/場次/REC/PI/真 UI 未核；SYNC_STATUS=`CI_PENDING`，未寫 GAS、未部署、未寫正式資料、未啟用真人收件。舊 Repo/GAS、RIF/E-Prime 不變。

### 2026-11-15｜E1 私人 PDF 管理候選同版 CI 已回讀
- SOURCE_VERSION/CODE_SHA=`79cceddebe849389811d186c67f3090110684e6e`；[Run #43705352952](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43705352952)／Job #132785125300 原始日誌：`309 tests / 309 PASS / 0 FAIL / 0 SKIP`，completed/success；原 306 項保留，新增三組候選 E1/OWNER 範圍、原來源 lock/revision/SHA、未知寫入後唯讀成功仍鎖存負測均通過。
- VERIFIED_BLOBS：`scripts/study1-v2-gas-head-only.cjs=c207e4bd4adc42c3139295af86b704ece3a8da88`；`tests/study1-v2-gas-head-only.test.cjs=26b75ba1ce44b3b5d4f3223892b85555ccd2a632`；`tests/study1-owner-presigned-pdf-ui.test.cjs=52cabb9a296e7a437d7ba77ce67cbe16c59f30e0`。原 gas/ 未變。
- 由同版 CI 離線產生之 PRIVATE_E1_MANAGEMENT_CANDIDATE_SHA256=`b33dd95f092e562ab7948645fcf997e2545b9ad9fefe1e6f9bc4cffd9d4d0da3`。此 SHA 僅候選內容，不代表遠端 HEAD 或版本。LAST_VERIFIED_STEP=`PRIVATE_OWNER_MANAGEMENT_CANDIDATE_CI_VERIFIED_ON_79CCEDD`。
- NEXT_ACTION=優先使現有 V2 發布工具支援新版候選的獨立唯讀遠端 inventory、確切 27-source candidate digest 與人工確認／備份／競寫／來源／不可變版本回讀；不得將舊 32-file TARGET 或其 audit 視為新遠端核驗。候選尚不連入 HEAD apply/deploy；正式 PDF 上傳選用及來源指定真 UAT、GAS HEAD/版本/部署與真人收件均未執行或授權，`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。本追記只修改進度檔；其新 SHA CI 另查，不冒稱遠端成功。

## 2026-11-15｜新版私人 E1 管理發布工具接續
- TASK_DOMAIN=`Study1_V2_E1_PRIVATE_RELEASE_TOOLING`；PRE_MAIN_SHA=`2ce4fc41fd0f21408d7628c3115dccd6324e9cd7`，Run #43705417219 309 PASS；原候選 SHA `b33dd95f092e562ab7948645fcf997e2545b9ad9fefe1e6f9bc4cffd9d4d0da3` 不變。讀 AGENTS、§70-S.34–36、原 HEAD/private deploy 工具及安全測試。
- COMPLETED（工程待 CI）：原 HEAD-only workflow 增加 private_e1_management profile，從原既有候選精確綁定 27-source SHA；private apply 獨立確認字串、遠端完整 HEAD SHA 及 inventory fingerprint，保留加密備份 artifact，PUT 前／後核對 inventory、開發部署 MYSELF、既有不可變版本／部署、最新 main；無 CAS 仍禁止人工同時修改，PUT 結果不明不重送。
- 原 private deploy workflow 分離 audit/ version/ deploy。audit 允許先讀遠端與目標不同的 HEAD、完整版本/部署 metadata 與原始內容 SHA/manifest，未知來源標記不安全且不允許寫入。版本建立與指定不可變版本部署各自須明確確認、最新 main、完整 inventory fingerprint；建立後/部署前重新稽核；每階段單次 POST，GET 回讀原版本/部署及 ACL，禁止盲目重送；既有版本/部署不改。舊 32-file SHA 僅歷史來源核對，不能代替新 candidate；公版原 gas/ 不改。
- TESTS=保留原公版、HEAD、私人部署測試；原 32-source 測試改核定現行 27-source candidate，原合併版本/部署情境以分段測試助手維持完整正/負向案例；新增遠端未同步 audit、分段授權、候選 SHA、競寫及回讀等測試。兩套 CI 各自回讀。
- BLOCKERS=當前 connector 無 Apps Script GET 或 workflow dispatch，需由 OWNER 執行新 GET-only audit 才能核對遠端現況。本輪僅 GitHub 工程，不執行 GAS HEAD PUT、version POST、deployment POST、正式資料寫入、真人收件、舊系統或其他研究。SYNC_STATUS=`CI_PENDING`；NEXT_ACTION=同 SHA CI、公開/私人原始日誌確認，再手動執行 audit（不填任何寫入確認）；依新 audit 另獨立授權，依序 HEAD、建版、部署。
- CI_INCREMENT：初版 `785bfad2e9e343b56c3e80cb5b973e4b849f4cd2` Run #43705903568（Job #132786793177）311/311、Run #43705903618（Job #132786793121）49/49，全無 fail/skip，原 candidate SHA 不變。續補 version/deploy 各自獨立 GET-only prepare、原 HEAD bytes 與完整 metadata/proofs snapshot，AES-GCM 加密、AAD 綁定本 operation/main/run/target/inventory/version、ciphertext artifact 成功後才進入 mutation，重核 backup/fingerprint/即時 main；版本原有 immutable proofs 回讀增加。第二版 CI 待核，初版成功不能冒充新 main。
- CI_INCREMENT_2：程式 SHA `46bb18677aeaa8b434bd7e8e1f63b8a1a44f18da` Run #43706000558（Job #132787088854）311/311、Run #43706000574（Job #132787088958）51/51，全無 fail/skip，原 candidate SHA 不變；新增 release backup/AAD/篡改拒絕與 artifact → mutation 次序測試均通過。續補 mutation rerun 禁止：HEAD apply/prepare、version/deploy 只接受 GITHUB_RUN_ATTEMPT=1，audit 可 GET-only 重跑；結果 UNKNOWN 不直接重跑 failed jobs，獨立核對最新 inventory、確認原結果及重新獨立授權後才考慮新 dispatch。第三版同 SHA CI 待核。

### 2026-11-15｜新版發布工具同版雙 CI 驗收
- SOURCE_VERSION/CODE_SHA=`ef388a6ece1fd30f4f208f050819db06ff9d98e6`；公版/E1 [Run #43706072167](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43706072167)／Job #132787309895：311 PASS、0 FAIL、0 SKIP；私人發布 [Run #43706072179](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43706072179)／Job #132787309985：51 PASS、0 FAIL、0 SKIP。兩套有重疊，不能合計為獨立測試數。兩份原始日誌皆核對同一私人候選 `b33dd95f092e562ab7948645fcf997e2545b9ad9fefe1e6f9bc4cffd9d4d0da3`；原公版 gas/ 未改。
- LAST_VERIFIED_STEP=`PRIVATE_E1_RELEASE_TOOLING_CODE_CI_VERIFIED`。既有 HEAD-only 與 private-deploy workflows 現分離 private HEAD apply、version、deploy，均先獨立 audit、精確 target/remote/inventory、加密備份、競寫核對、首次 run attempt、單次遠端 mutation、回讀。遠端 API 無原子 CAS，仍須排除外部/人工競寫。UNKNOWN 未獨立釐清不得新 dispatch 或重送。
- NEXT_ACTION=由 OWNER 開啟既有 [私人 inventory workflow](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/workflows/study1-v2-private-deploy.yml)，branch=main、mode=audit、reviewed_sha=當下最新通過 CI 的 main SHA、reviewed_target_sha256=上述私人候選 SHA。private_version、expected_inventory_sha256、confirmation 留空。讀回 HEAD SHA、access、版本 proofs、部署清單及 inventory 指紋，確認是否仍為歷史私人 HEAD、是否有未知來源／部署。若 audit 判定不安全，停止後續 mutation，不把舊 32 檔證據當現況；後續 HEAD 同步、建版、部署各須使用獨立新授權及最新 audit。
- SYNC_STATUS=`GAS_REMOTE_AUDIT_REQUIRED`；本輪連線不支援遠端 Apps Script GET 或 workflow dispatch，未執行新的遠端 audit、PUT、version/deploy POST、正式研究資料寫入、真 UI 或真人收件。不得聲稱已上線。原正式規格、舊系統、RIF/E-Prime 不變。文件追記後同 SHA 雙 CI 另查。

## 2026-11-15｜解除 OWNER 手動登入依賴：自動唯讀遠端稽核
- TASK_DOMAIN=`Study1_V2_E1_RELEASE_AUTO_AUDIT`；PRE_MAIN_SHA=`132b22d655d2c986c4812447798d8e6b2c6db6af`；原 311/51 CI 及私人來源 SHA 不變。使用者要求減少施工安全層及人工登入，正式規格 §70-S.37 增量記錄開發期唯讀新觸發。
- COMPLETED=既有私人 workflow 增加獨立 main push GET-only job，固定 V2 Script／main／已驗候選；不需人工 dispatch，不輸出憑證或部署 URL。原 manual mutation job 明確限定 workflow_dispatch；API readOnly 防止 project POST，audit/prepare 同樣使用唯讀 client。原 CI 保留並新增自動／人工隔離及 HTTP 負測；公版 gas/ 與私人候選未改。
- LAST_VERIFIED_STEP=`AUTO_AUDIT_COMMIT_PENDING_CI`；需原始 CI 與實際遠端 job 日誌證實，自動稽核成功不等於部署。若 OAuth、遠端未知來源或 Actions 權限失敗，記錄確切阻塞，不重送 mutation。無 GAS PUT、version/deployment POST 或真人資料操作授權；`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。

### 2026-11-15｜自動遠端唯讀稽核與同版 CI 已核實
- SOURCE_VERSION/CODE_SHA=`cc98289be93b4fc3b5b6f868efd21f4f6b708b33`；公版/E1 Run #43706542827（Job #132788762043）311/311；私人安全 CI Run #43706542804（Job #132788762053）53/53；0 FAIL、0 SKIP。原始日誌回讀，同 SHA 兩套合成測試均成功；不相加為獨立測試總數。
- 實際新 V2 GAS [Auto Audit Run #43706542813](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43706542813) / Job #132788762218，2026-11-15 18:57 臺灣時間，completed/success。源程式 SHA 同上。實際 `automatic-inventory` 成功，原 `private-preview` mutation job skipped。53/53 安全測試，OAuth/GET 成功；`V2_PRIVATE_AUDIT_NO_MUTATIONS=true`。
- REMOTE_HEAD_SHA256=`73dea801154abbe847863a07df2e623fc1d68622a4442f006d1be7473dd5a0f7`／32 files／MYSELF；版本 1 同 SHA／32 files／MYSELF/known=true；2 deployments（開發 HEAD 與 version 1）。最新 `V2_PRIVATE_INVENTORY_SHA256=4d85ca4609ccab451221012b454957d80d605603602cb283addff8d0e6846d2e`；`V2_PRIVATE_INVENTORY_KNOWN_SAFE=true`。此為當時實際 audit，不是永久預設值。HEAD 尚未匹配私人 E1 target `b33dd95f092e562ab7948645fcf997e2545b9ad9fefe1e6f9bc4cffd9d4d0da3`／27 sources。
- LAST_VERIFIED_STEP=`AUTO_REMOTE_AUDIT_VERIFIED_ON_CC98289`；SYNC_STATUS=`REMOTE_AUDIT_SUCCESS_HEAD_SYNC_REQUIRED`。使用者不需登入或手動 dispatch 唯讀稽核，相關 main 程式更新可自動觸發；docs-only 追記不重跑遠端稽核。此輪未寫 GAS、未建版、未部署、未讀寫正式研究資料、未啟用收件。下一步宜集中明確核准同一 V2 私人管理版本 HEAD 同步／建版／部署的具體範圍，由程式自動執行備份與回讀，未核准不執行遠端 mutation；正式資料操作、真人收件仍獨立。原公版、舊系統、其他研究領域不變。

## 2026-11-15｜本輪一次授權集中私人 E1 發布
- TASK_DOMAIN=`Study1_V2_E1_PRIVATE_RELEASE_ONCE`；PRE_MAIN_SHA=`50d3d832fe73d83b58b71c4195e6540c9cf5ee45`，上一輪同 SHA 公版311/私人53 PASS，遠端已知 baseline 如前次 Audit。SOURCE_OWNER=唯一 V2 main／同一 V2 Script；使用者明確授權本輪 HEAD 同步、建版、MYSELF 私人部署（不含正式資料／收件），正式規格 §70-S.38。
- IMPLEMENTED=沿用既有私人候選與原部署工具；本次受信任 main push 的精確 parent、commit message、候選 SHA、baseline inventory、first run attempt 限定一次發布。每階段先完整同版公/私 CI 與即時 GET、加密備份 Artifact、競寫檢查，單次 PUT/POST 及 readback。失敗只 GET-only reconciliation；後續 commit 不觸發 mutation，原手動安全入口保持。原 gas/、公開權限及舊系統不變。
- LAST_VERIFIED_STEP=`ONE_TIME_RELEASE_PENDING_ACTUAL_RUN`；必須取得實際 Run/相應 Job、備份 artifact、HEAD、immutable version、MYSELF deploy、最終 inventory readback；CI PASS 不能冒充部署。未驗收真人 UI、正式資料、收件；保持 `FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`。若遠端狀態競寫或結果未知，停止後續寫入並查證，不重新觸發原 release。
- 首次一次性發布提交 `e6020f1b4d9e51c669409c8ddd4fadc69db34c66`：Run #43706898702 在 workflow definition 階段 failure，job list 為空；兩套同版 offline checks success，無 GAS mutation 執行。修正 YAML job if 使用 folded scalar，授權 marker 移除 colon-space；重新鎖定前序提交，原 candidate/baseline/授權範圍不變。本次新 Run 必須先重新 GET baseline 與同版 CI；不是重跑遠端 mutation。

## 2026-11-15｜集中發布實際結果與開發期規則精簡

- TASK_DOMAIN=`Study1_V2_E1_DEVELOPMENT_STREAMLINE`；PRE_MAIN_SHA=`7cf19bff6e53b20f9fc66f8187b4cda7c517c292`。本次先回讀原 Run #43706978095／Job #132790139263 的完整原始日誌，completed/failure；同 SHA 公版311/311（#43706978097）、私人55/55（#43706978068）。
- REMOTE_VERIFIED：實際 HEAD PUT readback 27 files SHA `b33dd95f092e562ab7948645fcf997e2545b9ad9fefe1e6f9bc4cffd9d4d0da3`；immutable version 2 同 SHA 已建立、回讀成功。HEAD、version 加密 Artifact ID 14158926450、14158906388，原 Run 前兩階段成功。部署前錯誤 `remote changed after version verification`，deploy 遠端 POST 步驟 skipped；後續 GET 429 有界退避後 2026-11-15 19:05 臺灣時間唯讀查核成功：version 1/2，部署 2（HEAD + version 1）、MYSELF、known safe，target matched true；`V2_PRIVATE_INVENTORY_SHA256=4c1e3f0da7027b81406ecc96619ded2b44e70cef1585454388fafc5dd73bfa10`（舊比較格式的歷史證據）。未有單項差異日誌，不能確認上次變動具體欄位；密集 GET 已有實際 429 證據。
- LAST_VERIFIED_STEP=`PRIVATE_HEAD_SYNC_AND_VERSION_2_VERIFIED_DEPLOY_NOT_EXECUTED`。本次依使用者要求更新唯一正式規格 §70-S.39 與 AGENTS.md，使開發期集中既有授權、依最新來源、風險分級、最短路徑，不再用歷史固定測試數或部署 SHA 作永久阻塞。保留個資、OWNER、公開唯讀、正式資料/PI/REC/真人啟用等界線。
- IMPLEMENTED=HEAD 工具的私人 target 以當前核定 checkout 動態生成；仍須同版精確 SHA/allowlist，已驗證 version 1/2 SHA 保留歷史來源識別。private release 的 semantic inventory 比對不以 deployment updateTime 為一致性欄位（原始值仍在備份），保留 ID、版本、ACL、來源、執行身分、URL、description。減少 reviewedMutation 與 deploy POST 前重複 GET，以獨立備份後的一次完整 fresh inventory 比對並保留完整寫後回讀。新增不變量及 GET 次數正負測。既有一次性 release 綁定舊 parent，已消耗，不重觸發；既有人工入口保留作備援，不作一般開發必經流程。
- SYNC_STATUS=`CI_PENDING`；更新規格、Agent、既有工具/測試、原進度，不修改 gas/、GAS、正式研究資料、公開權限、舊系統或真人收件；本輪未作新部署。NEXT_ACTION=同 SHA CI 與自動唯讀稽核取得新 semantic inventory；沿用先前明確授權及已驗 version 2，僅接續尚未執行的私人部署，無需重做 HEAD/建版或重複要求登入。正式資料、真 UI、PI/REC 與收件仍獨立。

### 2026-11-15｜開發期精簡規則／工具同版驗收
- SOURCE_VERSION/CODE_SHA=`cc5394bdacfc17b306689a2e6d78012930ef1a46`；[公版 CI #43707523710](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43707523710) Job #132791718346：311/311；[私人 CI #43707523715](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43707523715) Job #132791718217：58/58。皆 completed/success、0 FAIL、0 SKIP，CI 有重疊。私人目標 SHA 與前次核定完全一致。三項新增測試涵蓋非關鍵 updateTime、現行 checkout 來源 SHA、保持回讀並減少 POST 前 GET。
- 原正式規格 §70-S.39 blob `5684faa8c6ae65989146c1d4cb790759a5079d10`；AGENTS.md blob `a984f03bfb707f279c19efb7c9910374d5e5cd64`；同 main 及原路徑回讀通過。原 GAS 程式來源 gas/ 不變。
- [新版自動遠端唯讀稽核 #43707523732](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43707523732) Job #132791718642 2026-11-15 19:09 臺灣時間完成成功；原 manual 與舊 one-time mutation job 均 skipped。GAS HEAD 27 files＝核定 `b33dd95f092e562ab7948645fcf997e2545b9ad9fefe1e6f9bc4cffd9d4d0da3`；version 2 同 SHA/27 files/MYSELF/known=true；version 1 歷史原 SHA 保持；2 deployments（HEAD + version 1）；新 semantic inventory `6cab520e1d8250d11094f62088ee4f1743bcb5e06b974bd88d01f0e7001511a1`，KNOWN_SAFE=true，AUDIT_NO_MUTATIONS=true。此指紋為該次回讀結果，不當作永久新門檻。
- LAST_VERIFIED_STEP=`STREAMLINED_RELEASE_TOOLING_AND_REMOTE_VERSION_2_VERIFIED`；SYNC_STATUS=`PRIVATE_VERSION_2_DEPLOY_PENDING`；集中發布原授權未完成階段只剩 version 2 私人部署，不重做 HEAD 或建版。新適用流程已驗合成及實際 GET，**尚未驗真實部署 POST**；舊一次性觸發已消耗，下一步在既有授權內建立有界接續，只發布同候選的 version 2，並驗證 MYSELF/USER_DEPLOYING、原既有部署不變。無需使用者登入填值。此次規則與工具精簡不執行遠端 mutation、正式資料、真人收件、排程或舊系統變更。文件追記的 main CI 另核。

## 2026-11-15｜只接續 version 2 私人部署（使用者明確授權）
- TASK_DOMAIN=`Study1_V2_E1_PRIVATE_VERSION2_DEPLOY_RESUME`；PRE_MAIN_SHA=`4f500f4b923d76db58a7194f42162f9e85e1ca22`；同 SHA 公版311/311、私人58/58 已回讀。依 §70-S.39 與 AGENTS.md，既有授權限同一 V2 GAS、核定 version 2 SHA `b33dd95f092e562ab7948645fcf997e2545b9ad9fefe1e6f9bc4cffd9d4d0da3`、MYSELF/USER_DEPLOYING。
- 先前原 Run #43706978095 已成功 HEAD 及 version 2，deploy POST skipped。最新正式 Audit #43707523732 證明 HEAD/version2 同核定 SHA、version1與原兩 deployment 保留，semantic inventory `6cab520e1d8250d11094f62088ee4f1743bcb5e06b974bd88d01f0e7001511a1`。此次專用續作綁定單一 parent、commit message、first attempt；原一次性三階段 workflow 不再觸發。本輪僅 deployment，現場重新 GET 核對、加密備份 Artifact、既有 deploy() 單次 POST 與完整 readback。若現況漂移或已有匹配部署，不送 POST，先查核。禁止 HEAD PUT、createVersion、正式資料或真人收件。
- SYNC_STATUS=`VERSION_2_DEPLOY_RESUME_PENDING_RUN`；需同版直接相關 CI、實際 backup/部署/ACL/版本與原 deployment 不變之日誌。未核真 UI 或正式啟用。發生 UNKNOWN 只 GET，不重送。

### 2026-11-15｜version 2 部署 POST 後讀回延遲
- SOURCE_VERSION/SHA=`029a91d6fbd7be2894c8baaee39f9ff046ca9711`；公版 Run #43708421628 311/311，私人 Run #43708421645 59/59，原始日誌同版 0 FAIL/skip。實際 Run #43708421687 automatic-inventory Job #132794491654 同版確認原版本 1/2、兩 deployment、核定 HEAD 及 semantic inventory；專用 resume Job #132794586053，原多階段 job skipped。
- 寫前加密 backup Artifact 14159745839 成功。唯一部署 POST 回應含合格 deploymentId、Script ID、version 2（既有程式驗證通過後才可執行 getDeployment），隨後 direct GET HTTP 404，故 `DEPLOY_POST_ACCEPTED_READBACK_UNKNOWN`，不可視為未執行。19:20:48 隨後即時 GET 清單仍僅 HEAD/version 1、兩 versions；不推斷新部署不存在、不再次 POST。不重做 HEAD 或 version。
- 本次僅對既有 automaticAudit 增量加入 version 2 如已出現在清單，核對同 ID 的 GET、核定版號/SHA、MYSELF/USER_DEPLOYING；由普通 main push 觸發 GET-only，兩個一次性 mutation job 條件均不符。若無新可核實部署，保留 UNKNOWN 阻塞並以唯讀觀察接續。原正式資料、公開權限及 E1 收件保持關閉。

### 2026-11-15｜私人 E1 version 2 實際部署成功與回讀
- TASK_DOMAIN=`Study1_V2_E1_PRIVATE_VERSION2_DEPLOY_RESUME`；SOURCE_VERSION/CODE_SHA=`4d47bd4aaf4b6eb5b335070ce301175195c8420f`；公版 [Run #43708576840](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43708576840) Job #132794956853 311/311；私人 [Run #43708576854](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43708576854) Job #132794956930 59/59，兩者 completed/success、0 FAIL、0 SKIP（測試有重疊）。
- 實際單次 POST 為前次 [Run #43708421687](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43708421687) Job #132794586053；寫前加密備份 Artifact 14159745839（archive digest sha256:66c3f40017732f6371e6ea5e20b8a0c4328866e09345e08fe60b406220502a2e）。其 direct GET 404 造成 run failure，並非 deployment POST 確定失敗。本輪**未再重送 POST**。
- 最新 [遠端唯讀回讀 #43708576948](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43708576948) Job #132794957768 2026-11-15 19:22:14 臺灣時間 completed/success。日誌：version numbers=1,2；HEAD 27 files、version 2 同核定 SHA `b33dd95f092e562ab7948645fcf997e2545b9ad9fefe1e6f9bc4cffd9d4d0da3`、MYSELF；三個部署（HEAD、原 version 1、新 version 2）；`V2_PRIVATE_INVENTORY_SHA256=f36f8a5ce9d1658fc7d7cb5370438253d773e3f1d91c344de01ecdded2aed658`、KNOWN_SAFE=true、AUDIT_NO_MUTATIONS=true、`V2_VERSION2_DIRECT_READBACK_VERIFIED=true`。具體核對同一 deployment 的 GET/list、版本2完整原始碼SHA及 MYSELF/USER_DEPLOYING，前次未知結果已釐清；舊兩個部署仍存在，未逐一額外重驗原部署ID；無 HEAD PUT、建版或其他 deployment mutation。
- LAST_VERIFIED_STEP=`PRIVATE_VERSION_2_DEPLOYED_AND_DIRECT_READBACK_VERIFIED`；SYNC_STATUS=`PRIVATE_OWNER_DEPLOYMENT_VERIFIED`；PRIVATE_DEPLOYED=true，PRIVATE_UI_VERIFIED=false。受限的單次發布授權已用畢，禁止重觸發原 release/resume。OWNER 專用連結可由當次成功 audit job summary／原 GAS「管理部署」取得；不把未驗證的 URL 當網站入口。NEXT_ACTION=以實際 version 2 OWNER 登入集中進行必要 UI 驗收，及依 §70-S.39 推進 E1 報名/預約正式路線尚存缺口。正式資料、公開網站權限、REC、真人寄信、收件本輪未修改；PUBLIC_DEPLOYED/FORMAL_READY/LIVE_INTAKE_ENABLED 尚不宣稱 true。此後僅進度文檔追記，不觸發遠端 mutation；其適用 CI 另核。

## 2026-11-15｜E1 報名至原場次的可恢復接續
- TASK_DOMAIN=`Study1_V2_E1_INTAKE_TO_SLOTS`；PRE_MAIN_SHA=`94d6e2227dbcb1767f347b0da7e701dc977dd2e0`；原正式規格 §70-S.39、AGENTS.md、主進度及兩套同版 CI 成功已回讀。PRIVATE version 2 已部署及讀回，原授權已消耗；不重做。
- 實際缺口：已耗用 OTP 且瀏覽器持有原 server emailProof，後續 Applicants 狀態核對遇未知結果時無法繼續選時段；首次原 E1 slots 讀取失敗亦無安全重讀入口。原伺服器 study1ParticipantEmailStatus_ 已確認 HMAC、效期、原 Applicants/Screenings/Verification、ScriptLock、PENDING_EMAIL→EMAIL_VERIFIED 單次狀態轉換及 EMAIL_VERIFIED no-op，非純唯讀。沿用同一已取得 proof 進行可收斂狀態核對，不重寄、不重驗 OTP、不重建申請；未取得 proof、原狀態未核實或已過期不開啟場次。原 slots 查詢失敗清除舊場次/選擇、停用暫留，提供同一 proof 的唯讀重新載入，未知/既有預約不藉此重送。
- COMPLETED（待 CI）：原 gas/Study1Visitor.html 增量；原動態瀏覽器測試新增三情境（原狀態未知復原、無 proof/未核實拒絕、場次讀取故障重讀），保留其餘測試。既有私人部署測試依新 checkout 明確驗證舊一次性授權遇不同來源 SHA 拒絕，不更改授權工具或重發候選。沒有變更 server RPC、正式資料寫入邏輯、GAS、公開權限、REC 或真人收件。
- WRITE_OWNER=原 V2 main；SYNC_STATUS=`CI_PENDING`；NEXT_ACTION=驗收同版 CI，再依正式規格檢視 E1 發布與預約剩餘缺口；公開唯讀部署與真人啟用需其適用授權。程式新 SHA 不代表已同步 GAS；保留原私人 version 2。

### 2026-11-15｜E1 報名至原場次接續同版驗收
- SOURCE_VERSION/CODE_SHA=`5743b1ada629020722ade8c33935b4aa102d558c`；[公版／E1 CI #43709274411](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43709274411) Job #132797102249：314/314 PASS、0 FAIL、0 SKIP；[私人發布 CI #43709274345](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43709274345) Job #132797101546：59/59 PASS、0 FAIL、0 SKIP；原始同版日誌回讀。新增三組合成瀏覽器接續測試均通過，保留原功能/安全覆蓋，歷史一次性發布遇新來源 SHA 被拒絕，不修改發布工具。
- [自動唯讀稽核 #43709274346](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43709274346) Job #132797101876 completed/success，V2_VERSION2_DIRECT_READBACK_VERIFIED=true；原 manual、version2-resume 及 once mutation jobs skipped。新 checkout 私人候選 SHA256=`1131acc7f283fb0a6982d01193bf510acd398eeea3970d854e03826a7b5a138d`（來源變更的衍生指紋，不另建候選也非發布授權），原遠端 version 2 仍為已部署舊核定內容，不同步本輪新 visitor。公開新部署仍未執行；正式資料、真人 OTP/郵件、收件、REC、舊系統、排程均不修改。
- LAST_VERIFIED_STEP=`E1_EMAIL_STATUS_AND_SLOT_FETCH_RECOVERY_CI_VERIFIED`；SYNC_STATUS=`GITHUB_CODE_VERIFIED_GAS_RELEASE_PENDING`；NEXT_ACTION=依 §70-S.39 持續補公開報名/預約尚存工程缺口，必要時集中取得新公開唯讀發布的具體授權，保留正式 participant activation 的獨立 PI/REC、資料安全及真人收件核准。不得將本輪合成流程或已部署私人版本當作新公版/真人 UI 驗收，亦不重做原私人部署。

## 2026-11-15｜公開登入後唯讀一次性發布
- TASK_DOMAIN=`Study1_V2_PUBLIC_READONLY_RELEASE`；PRE_MAIN_SHA=`9512b57146828d50bb4f53d8012863b8a33e10bb`；同版原公版314/314、私人59/59成功（#43709388552/#43709388508）；最新 remote audit #43709274346 確認私人1/2與原三個部署、inventory `f36f8a5ce9d1658fc7d7cb5370438253d773e3f1d91c344de01ecdded2aed658`。本輪具體授權見§70-S.40。
- 沿用現行 public manifest ANYONE、USER_DEPLOYING 與原 server deny-all；不改 gas/。原發布工具增量接續單次 main push，專用薄 adapter 使用既有 core / inventory / API / encryption，精確比較原 parent gas tree、同版完整 CI、原 private baseline、一份完整寫前加密 backup 及 artifact；只執行一次 HEAD PUT、version POST、deployment POST 並讀回。原私有不可變版本及 deployment ID/ACL 必須保持；開發 HEAD 若 API 顯示更嚴格 MYSELF 仍接受，正式版必須 ACL 明確符合。遇未知結果只 GET，不重送。
- LAST_VERIFIED_STEP=`PUBLIC_READONLY_RELEASE_PENDING_RUN`；SYNC_STATUS=`PUBLIC_RELEASE_CI_AND_REMOTE_PENDING`；不啟用真人收件、正式資料、原私人部署、舊系統或其他研究排程。實際公共網址只以成功回讀的 Google web app URL 為準。
- 第一個發布 Run #43711145391／Job #132802820909 completed/failure：同版公314/314、私61/61；prepare 在 core.latestMain is not a function 失敗，backup upload、apply 全 skipped，沒有 GAS 寫入。修正既有 core 匯出及測試、重新綁定父提交與本次發布事件；原 gas/ 不變、原授權及 baseline 不變，先重新自動 GET 核對，非重送未知 mutation。

### 2026-11-15｜公開 HEAD 與 version 3 已核實；只接續部署
- SOURCE_VERSION/CODE_SHA=`b2e63c0109cb90c21bb0df04c76dcb78f09ae2ad`；同版公314/314、私61/61，實際 [Run #43711280217](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43711280217) Job #132803212536（完成失敗）：寫前加密 Artifact 14160298906（archive digest sha256:490c14052eecb28d505c7e2544a92e11b97ff85f35168a4d0cbd0953e4d34d75）；target `3449d43bee67d450a1934cd24870b581c487bd84f854511a467e270bccf62158`；19:56:33 臺灣時間 HEAD source/full private immutable inventory GET 核實；19:56:50 version 3 建立及內容／清單回讀成功；19:56:53 deploy 前 inventory 指紋變動，POST 未達。GET-only reconcile 隨後 versions list 暫時只回1,2，HEAD 仍 ANYONE、原三部署；不能將 list 暫時缺 version 3 視為建版未執行。
- LAST_VERIFIED_STEP=`PUBLIC_HEAD_AND_VERSION_3_READBACK_RECORDED_DEPLOY_NOT_EXECUTED`。本次只續作原已核實 version3 的 MYSELF 保留、ANYONE 部署；原加密備份跨 Run 下載並解密核對原私人不變量，重新取得 version 3 exact SHA、fresh inventory 及新加密備份，單次 POST，完整回讀；若版本清單滯後先有限 GET、絕不重建 version 或 PUT HEAD。此次精確限定新 parent／marker／first attempt，不重觸發完整發布；未啟用真人收件。SYNC_STATUS=`PUBLIC_VERSION3_DEPLOY_RESUME_PENDING`。

### 2026-11-15｜公開 version 3 已部署；一般帳號實際 UAT 存取失敗
- TASK_DOMAIN=Study1_V2_PUBLIC_READONLY_UAT；SOURCE_ID/PATH=唯一 V2 repo / GAS / docs/V2-MIGRATION-STATUS.md；SOURCE_VERSION/SHA=`005460ca000e2520d801d41ac5ce25b909f81f8b`。同版公版 CI #43711500973 314/314、私人發布 CI #43711500972 62/62，0 FAIL、0 SKIP。
- 實際發布 [Run #43711501002](https://github.com/solactw-star/study1-recruitment-e1-v1/actions/runs/43711501002) Job #132803924288 completed/success：原加密備份下載核對、當期寫前加密備份、單次 deployment POST accepted；2026-11-15 20:00:53 臺灣時間完整 deployment GET/list、version 3、ANYONE/USER_DEPLOYING、原私有部署不變均回讀成功。HEAD/version3 核定源 SHA256 `3449d43bee67d450a1934cd24870b581c487bd84f854511a467e270bccf62158`。公開 URL=https://script.google.com/macros/s/AKfycbz0vpcvdWdPzGdloLF82P7hwVi8JRWi61PsXyrLc9WHPdTTUSVKJ0vQjMStLTg0mEM/exec。無重複 HEAD PUT/建版；原公開發布及續作授權已用畢。
- 新實際證據：使用者於一般非 OWNER Google 帳號已登入時，開啟公開入口呈 Google Drive「需要存取權」頁（本對話截圖）。沒有顯示正常網站首頁。此為真實 UI 測試失敗，不得以部署 API 或 CI 冒充 PUBLIC_UI_VERIFIED。截圖不足以證明請求是否進入 doGet，亦不足以斷定多帳號或平台 ACL 為原因。當期 gas/appsscript.json ANYONE/USER_DEPLOYING；Website.doGet 首頁沒有 OWNER 限制。候選原因：Google [多帳號登入官方限制](https://developers.google.com/apps-script/guides/support/troubleshooting?hl=zh-tw)；[Issue 574946511](https://issuetracker.google.com/issues/574946511) 有相似非 OWNER 存取異常（11/13 新回報；非本案確診）。
- COMPLETED=回讀既有成功部署及實際失敗 UI 證據、最新 main/CI、相關規格與程式；LAST_VERIFIED_STEP=PUBLIC_V3_DEPLOYMENT_VERIFIED_NONOWNER_UI_FAILED；PUBLIC_DEPLOYED=true、PUBLIC_UI_VERIFIED=false、FORMAL_READY=false、LIVE_INTAKE_ENABLED=false；BLOCKERS=PUBLIC_UI_ACCESS_FAILED；NEXT_ACTION=以 Chrome 無痕只登入一個非 OWNER Google 帳號測原 /exec，再按結果核對 OWNER 比較測試與對應 GAS 執行紀錄（不得冒稱已讀到）。若無痕仍失敗，針對 Google 服務入口/實際 ACL 查明，而非重複建版或共享研究資料。WRITE_OWNER=原進度主檔；SYNC_STATUS=PUBLIC_DEPLOYMENT_VERIFIED_UAT_BLOCKED。此輪只補記進度，不改 GAS、部署、資料、權限、正式收件、其他程式或排程；無需重啟舊 release。

### 2026-11-15｜公開 v3 無痕單帳號驗收仍失敗
- TASK_DOMAIN=Study1_V2_PUBLIC_READONLY_UAT；SOURCE_VERSION/SHA=`0cdc6d3ce115c52a244b916a4aac16a429d2a6e3`。再次回讀成功發布 Run #43711501002／Job #132803924288 原始日誌（ANYONE/USER_DEPLOYING、version 3、原私人部署不變、收件 false）、現行 Website.doGet 與 manifest、最新規格及 AGENTS.md；此為歷史成功部署證據，不冒稱新的遠端 GET。
- 最新使用者截圖及實測：Chrome 無痕視窗、非 OWNER Google 帳號仍出現 Google Drive「需要存取權」。因此多帳號登入衝突可能性下降，不再要求同樣測試。Google 官方 Issue #574946511 截至 2026-11-15 為 Assigned/P2、無修復公告，11/13 有最小 HTML standalone script 及兩獨立 Gmail 重現非 owner 存取錯誤的回報；是相似平台候選原因而非本案確診。尚未取得 OWNER 同一 public /exec 比較結果或實際 GAS executions；不可聲稱 doGet 未執行。
- LAST_VERIFIED_STEP=PUBLIC_V3_NONOWNER_INCOGNITO_UAT_FAILED；BLOCKERS=PUBLIC_UI_ACCESS_FAILED；PUBLIC_DEPLOYED=true、PUBLIC_UI_VERIFIED=false、FORMAL_READY=false、LIVE_INTAKE_ENABLED=false。NEXT_ACTION=僅需一次 OWNER 同一公開 URL 比較與相應 GAS 執行紀錄（現有連線無可核實的 execution log 入口）；若 OWNER 可開且非 OWNER 無相應執行記錄，高度指向 Google 存取層，停止盲目重新部署，評估經授權的獨立公開資訊入口與原安全後端的可行方案。正式 participant 入口及 PI/REC/資安須另驗，不能以靜態首頁冒充完整營運；不改舊系統、不放寬 Drive 資料權限或 ANYONE_ANONYMOUS。若 OWNER 也無法開啟，先查當前帳號與 Google 部署/授權設定。WRITE_OWNER=原進度主檔；SYNC_STATUS=PUBLIC_UI_ACCESS_BLOCKED；本輪僅文件記錄，不改程式、遠端 GAS、部署、資料、權限或排程。


### 2026-11-15｜E1 預簽 PDF 原件唯讀復原
- TASK_DOMAIN=Study1_V2_E1_PDF_READ_RECOVERY；PRE_MAIN_SHA=adf911fdf91f9a05d57dc888df77b6d80a9966d1；依 §70-S.36、39 與 AGENTS.md，獨立推進核心工程。
- 原 PDF 傳輸或 SHA 驗證失敗後 review 停用，無同憑證重取入口；本輪改原 visitor 的 review 行為，沿用原 token 只讀取 PDF，不重建預約/同意、不重簽；同一 consent object 與 loading 狀態拒絕過時非同步回應。原 SHA、版號、大小、PDF header 檢核保留。新增兩組合成正負測：傳輸錯誤復原、內容篡改與已取代的同 token 回應。 
- LAST_VERIFIED_STEP=PATCH_PREPARED；COMPLETED=程式/測試/進度候選；NEXT_ACTION=同 SHA CI 回讀、失敗修復及後續 E1 預約/管理缺口；BLOCKERS=PUBLIC_UI_ACCESS_FAILED（獨立）、PI/REC 與真人收件另驗；WRITE_OWNER=唯一 V2 repo；SYNC_STATUS=GITHUB_CI_PENDING。未授權遠端 GAS 寫入、部署、正式資料、真人收件/信件；舊系統封存不變。
