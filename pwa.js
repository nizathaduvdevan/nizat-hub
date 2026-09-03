
(function(){
  'use strict';
  var deferredInstallPrompt = null;
  var installWrap = document.getElementById('pwa-install-wrap');
  var installBtn = document.getElementById('pwa-install-btn');
  var iosGuide = document.getElementById('pwa-ios-guide');
  var iosClose = document.getElementById('pwa-ios-close');
  var updateBar = document.getElementById('pwa-update-bar');
  var updateBtn = document.getElementById('pwa-update-btn');
  var waitingWorker = null;

  function isStandalone(){
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isIOS(){
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  }

  function showUpdate(worker){
    waitingWorker = worker;
    if(updateBar) { updateBar.hidden = false; updateBar.style.display = 'flex'; }
  }

  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    deferredInstallPrompt = e;
    if(!isStandalone() && installWrap) installWrap.hidden = false;
  });

  window.addEventListener('appinstalled', function(){
    deferredInstallPrompt = null;
    if(installWrap) installWrap.hidden = true;
    localStorage.setItem('nizatHubPwaInstalled','1');
    try{
      if(typeof firebaseReady!=='undefined' && firebaseReady && typeof db!=='undefined' && db){
        var vid = (typeof currentViewerId==='function') ? currentViewerId() : null;
        var label = 'לא ידוע';
        if(typeof session!=='undefined' && session){
          label = session.branchName || session.areaLabel || (session.role==='marketing' ? 'מחלקת שיווק' : 'לא ידוע');
        }
        var docId = (vid || 'unknown_' + Date.now()).toString().replace(/[\/\s]/g,'_');
        db.collection('pwaInstalls').doc(docId).set({
          viewerId: vid || null,
          label: label,
          installedAt: new Date().toLocaleDateString('he-IL') + ' ' + new Date().toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'}),
          userAgent: navigator.userAgent
        }, {merge:true});
      }
    }catch(e){ console.error('PWA install tracking failed:', e); }
  });

  if(installBtn){
    installBtn.addEventListener('click', async function(){
      if(!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      try { await deferredInstallPrompt.userChoice; } catch(e) {}
      deferredInstallPrompt = null;
      installWrap.hidden = true;
    });
  }

  if(isIOS() && !isStandalone() && !localStorage.getItem('nizatHubIosInstallGuideSeen')){
    setTimeout(function(){ if(iosGuide) iosGuide.hidden = false; }, 1800);
  }
  if(iosClose){
    iosClose.addEventListener('click', function(){
      iosGuide.hidden = true;
      localStorage.setItem('nizatHubIosInstallGuideSeen','1');
    });
  }

  if('serviceWorker' in navigator){
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('./service-worker.js', {scope:'./'}).then(function(reg){
        window.nizatSwRegistration = reg;
        if(reg.waiting) showUpdate(reg.waiting);
        reg.addEventListener('updatefound', function(){
          var newWorker = reg.installing;
          if(!newWorker) return;
          newWorker.addEventListener('statechange', function(){
            if(newWorker.state === 'installed' && navigator.serviceWorker.controller){
              showUpdate(newWorker);
            }
          });
        });
      }).catch(function(err){
        console.error('NIZAT HUB service worker registration failed:', err);
      });

      var refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', function(){
        if(refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    });
  }

  if(updateBtn){
    updateBtn.addEventListener('click', function(){
      if(waitingWorker) waitingWorker.postMessage({type:'SKIP_WAITING'});
    });
  }
})();
