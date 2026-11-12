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
