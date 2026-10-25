/* Instrumentation wraps delivery only; original provider read executes fully. */
(() => {const original=storageManager.getLocalProviderState.bind(storageManager);storageManager.getLocalProviderState=async function(){const result=await original();return QA.gate('provider-read',result)};})();
