# Study1 V2｜建置 Agent 接續指引（非正式研究規格）

> 本檔僅約束本 Repository 中協作 Agent 的來源導航、工作選擇、安全驗證與回報。它**不是**研究設計、REC、網站功能規格、正式進度或授權主本；任何牴觸均以最新使用者明確決策及有權正式來源為準。勿複製本檔為另一份規格，勿以本檔取代原檔回讀。

## 每輪先讀（增量，禁止以舊摘要當現況）

1. 讀 GitHub `main` **當下** SHA、最近 commit／PR、相關 workflows／最新 CI；不要沿用前一輪固定 SHA、測試數、Run 或檔數。
2. 正式網站需求讀 `docs/study1-system-spec.md` 的**最新適用節**，特別留意 §70-S.34–36 與任何後續取代條文；唯一網站接續紀錄讀 `docs/V2-MIGRATION-STATUS.md` 的最新有效工作段落。
3. 按本輪工作只讀直接相關的 `gas/`、`tests/`、`scripts/study1-v2-*`、`.github/workflows/`，以及對應來源／部署日誌。先核對已完成與已失效的工作，避免重做已通過階段。
4. 研究參與者程序、資格、正式同意或風險與有效 REC 不一致／適用未定時，標記 `REC_REVIEW_REQUIRED`，將受影響的真人啟用交 PI／研究行政，不把程式修改當研究倫理核准。

## 唯一施工範圍及不可跨越的界線

- 唯一網站程式／測試／規格／進度可寫入來源：`solactw-star/study1-recruitment-e1-v1` 的現有原路徑。唯一持續開發的遠端 GAS Script ID：`1qg3PuI8sGFOAP-pJ889d9RrN0p_e0zsfqM274HgG4sEg9Qjv-xzqeL2f`；**知道 ID 不代表有遠端寫入／部署授權**。
- 舊 `solactw-star/study1-recruitment-gas`、PR #133、舊 GAS 及其版本／部署一律 `LEGACY_FROZEN / READ_ONLY_ARCHIVE`，僅必要時唯讀查歷史；禁止修改、合併、同步、恢復或部署。舊 `scripts/study1-gas-*` 不得作為現行 V2 寫入工具；參見 `scripts/README-V2-SAFETY.md`。
- 不擅自修改或讀寫正式研究參與者資料、正式 Slots／Reservations／個資 Sheets、REC、研究者預簽 PDF、Script Properties、正式刺激、RIF Context；不建立平行正式 Repo／規格／資料庫。
- 原合成 Unified／Team／Fixture 及 Visitor Demo 僅保留於 `tests/fixtures/` 的隔離離線測試；不得回灌到 `gas/`、發布清單或公開 RPC。保持 V2 發布來源 allowlist 及伺服器端公版 deny-all 契約。

## 優先施工目標（非新的設計決策）

對照正式規格，以 E1 端到端 MVP 的尚未完成缺口為優先：招募／資格自陳與聯絡資料及 Email OTP → PI 已核定原 Slots/Reservations（HELD／CONFIRMED／UNKNOWN）→ 研究者**網站外預簽**完整正式 PDF、OWNER 原私人來源核對 → 參與者最後一次本人線上筆跡、完整 PDF 私人副本 → Email outbox／OWNER 必要管理與人工處置。不得自行捏造場次、核准 PDF、參與者或正式授權；E2 不自動開放。

已具備的功能先以最新 `main` 實際程式和同版 CI 核驗，**只修尚存缺口**。尤其需保留原申請、OTP、HOLD、PDF、Reservations 與 Email 的同一可信綁定；多儲存非 ACID 時不能用「PDF 已簽」推定「預約已確認」，也不能用「寄信提供者接受」推定「已送達」。

## Agent 實作／測試安全迴圈

1. `SOURCE_OWNER → TARGET → AUTHORIZATION → CONCURRENCY → WRITE → READBACK`：明確分辨只讀、GitHub 原程式修改、GAS HEAD 寫入、版本、部署及真人啟用的不同權限。先核對目標原本 SHA／版本；競寫、來源不一致或未授權就停止該寫入。
2. 限定相應 `gas/`、既有 `tests/`、必要 workflow 及原進度檔做**最小增量**；優先真實 E1 成功／失敗及安全負測。不刪測試、不以 skip／弱化驗證取得通過；高風險安全失敗必須修正。
3. 非冪等 POST／MailApp／PDF／跨 Sheet CAS 的回應未知：先查原唯一來源與事件／狀態，**禁止盲目重送**、自動補寄、重簽或重建預約。未知／部分寫入應 fail closed 並提供 OWNER 唯讀查核／人工處置；不可對真人測試。
4. 每次提交後完整回讀實際 `main` SHA、受影響檔案／diff、**同一 SHA** 最新適用 CI Job 原始日誌及正／負測；不能拿別的 SHA、單純 unit test、Demo 或合成 CI 冒充部署成功。再將實質完成、未完成、阻塞及下一步增量記入原 `docs/V2-MIGRATION-STATUS.md`，文件提交後也要另外核對新 SHA CI。
5. 遠端 **V2 GAS** 來源同步、版本建立及部署都需各自具體授權；在該階段重新檢查 OAuth、唯一 Script ID、manifest/ACL、寫前原始備份／SHA、競寫、完整 GET 回讀及版本／部署 inventory。過去失敗的部署或備份 Artifact 不是新 POST 授權。公開登入唯讀版與私人 OWNER 版分開驗證。
6. 無真實 Google 帳號 UI／PI 已核定資料／REC 適用結論及啟用授權時，只能宣稱 `MAIN_CODE_CI_VERIFIED`（若有同 SHA 證據），不得宣稱 GAS 已同步、公開版已部署、真 UI 已驗收或正式可營運。保持 `OPEN=false`、`CONSENT_READY=false`、`FORMAL_READY=false`、`LIVE_INTAKE_ENABLED=false`；不寄真人信、不啟用真人申請或簽署。

## 回報與接續格式

以繁體中文先答結果，記錄 `TASK_DOMAIN`、`SOURCE_ID/PATH`、`SOURCE_VERSION/SHA`、`LAST_VERIFIED_STEP`、`COMPLETED`、`NEXT_ACTION`、`BLOCKERS`、`WRITE_OWNER`、`SYNC_STATUS`；清楚區分已核驗、僅離線測試、待核、失敗、未執行。若本輪無安全可寫的進展，報告精確阻塞與可立即進行的替代工程，不因 OAuth／真人 UAT 尚未完成而重做舊 Demo。
