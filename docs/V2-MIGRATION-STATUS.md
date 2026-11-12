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
- TASK_DOMAIN=\`Study1_V2_REMOVE_OBSOLETE_SECOND_SIGNATURE\`；SOURCE_PATH=\`solactw-star/study1-recruitment-e1-v1\`／\`docs/study1-system-spec.md\` 最新 §70-S.36；PRE_MAIN_SHA=\`899ff1532ebb76019853096eb73af9983cad7fce\`。
- DECISION：網站尚未正式上線，不再保留舊研究員逐筆二次加簽、舊式邀請、單獨 PNG 簽署或事件確認的程式相容層；既有需要合法處置的撤回流程保留。本次僅清除**新 V2 Repo** 已淘汰來源，絕不寫舊 Repo／GAS／正式 Sheet／REC。
- CODE_DIFF：原 OWNER \`AdminConsole.html\` 完全移除隱藏二次簽名區與 \`staffPdfSetup_\`，獨立保留撤回後處置讀取；原 \`AdminSandbox.js\` 移除 \`study1EConsentConfirmPdf\`、二簽待辦及舊式手動邀請／研究員逐筆說明／單獨 PNG/事件確認/回執 RPC，並讓 \`study1EConsentSignPdf\` 唯一接受 \`FORMAL_E1\`、已預簽、本人可信綁定、\`ISSUED\` 原憑證；本人 \`study1EConsentSignedPdfCopy\` 僅放行原預簽加一次本人簽署的完整 SHA/日期事件鏈；原 PDF stamp 刪除研究員二次簽名的座標讀取與合成引擎。原 \`Study1FormalConsent.js\` 的原版 PDF/狀態只接受正式預簽流程。
- TESTS：刪除對已不存在功能做成功路徑的舊合成測試，替代為「舊 RPC 完全不存在」、非正式本人/非預簽/重送不得簽、完整副本 SHA/日期/ACL、原 OWNER UI 二次簽章區不存在且撤回仍可查等負測；納入既有 V2 安全 CI 及 REC 源流程檢查。
- WRITE_OWNER：僅新 V2 GitHub \`main\`；未進行 GAS HEAD PUT/部署、正式資料或郵件存取、真人收件啟用。同步狀態必須以下一 commit／CI 實際結果回讀為準，未回讀不得宣稱完成。原 \`OPEN=false\`／\`CONSENT_READY=false\`、\`FORMAL_READY=false\`、\`LIVE_INTAKE_ENABLED=false\`。
