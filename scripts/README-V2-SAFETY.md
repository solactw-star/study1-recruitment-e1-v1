# V2 移植安全限制

這些 `scripts/study1-gas-*.cjs` 是來源 PR #133 的原始邏輯留存，內有**舊 Repository、舊 GAS Script ID 或既有部署的嚴格比對**。V2 建置未完成重新綁定前，不得直接執行其 `apply` 或部署入口；不得把原 workflow 複製到 V2 啟用。

V2 目標 Script ID：`1qg3PuI8sGFOAP-pJ889d9RrN0p_e0zsfqM274HgG4sEg9Qjv-xzqeL2f`。V2 寫入新 GAS 需要獨立的 API/OAuth 與部署腳本、完整備份和回讀；原本正式 Sheets 不得當作測試資料。
