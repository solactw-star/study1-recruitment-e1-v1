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
