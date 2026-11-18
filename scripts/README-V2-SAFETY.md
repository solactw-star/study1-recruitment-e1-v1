# V2 移植安全限制

這些 `scripts/study1-gas-*.cjs` 是來源 PR #133 的原始邏輯留存，內有**舊 Repository、舊 GAS Script ID 或既有部署的嚴格比對**。V2 建置未完成重新綁定前，不得直接執行其 `apply` 或部署入口；不得把原 workflow 複製到 V2 啟用。

V2 目標 Script ID：`1qg3PuI8sGFOAP-pJ889d9RrN0p_e0zsfqM274HgG4sEg9Qjv-xzqeL2f`。依 §70-S.50，舊 V2 本地發布工具及工作流已淘汰，保留共用純來源、歷史證據與無遠端傳輸的 CHECK 核心。原 `.clasp.json` 僅保留唯一 V2 目標指標；不代表發布能力或權限。新發布程序在實際平台支援與適用授權成立後才建立，不規避既有拒絕；正式 Sheets 不得當作測試資料。
