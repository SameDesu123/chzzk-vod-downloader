// ==UserScript==
// @name         치지직 VOD 다운로더 (v11.0 시간 기반 진행률)
// @namespace    http://tampermonkey.net/
// @version      11.0
// @description  다운로드 진행 상황을 세그먼트가 아닌 '시간'으로 표시하여 직관성을 높였습니다. 모든 고급 기능은 유지됩니다.
// @author       Your name
// @match        https://chzzk.naver.com/video/*
// @require      https://cdn.jsdelivr.net/npm/streamsaver@2.0.6/StreamSaver.min.js
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      pstatic.net
// @connect      api.chzzk.naver.com
// @run-at       document-idle
// @License      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- ⚙️ 설정 (Configuration) ---
    const CONFIG = {
        PARALLEL_REQUESTS: 8,
        RETRY_LIMIT: 3,
    };

    class ChzzkDownloader {
        constructor() {
            this.isDownloading = false;
            this.cancelDownload = false;
            this.videoInfo = {};
            this.splitOptions = { enabled: false, size: 4, unit: 'GB' };
            this.ui = {};
        }

        init() {
            this.injectStyles();
            this.createMainButton();
        }

        // ⭐️ [신규] 초를 HH:MM:SS 형식의 문자열로 변환하는 헬퍼 함수
        _secondsToHHMMSS(totalSeconds) {
            if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = Math.floor(totalSeconds % 60);
            const pad = (num) => String(num).padStart(2, '0');
            return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
        }

        injectStyles() { /* 이전과 동일 */ GM_addStyle(`:root { --chzzk-green: #00d668; --chzzk-green-darker: #00b356; --chzzk-background: #111113; --chzzk-surface-1: #232328; --chzzk-surface-2: #333338; --chzzk-border-color: #444; --chzzk-text-primary: #fff; --chzzk-text-secondary: #d1d1d3; --chzzk-text-tertiary: #a0a0a3; --chzzk-button-disabled: #555; } #chzzk-downloader-main-btn { position: fixed; bottom: 20px; right: 20px; z-index: 9999; background-color: var(--chzzk-green); color: var(--chzzk-background); border: none; border-radius: 8px; padding: 10px 15px; font-size: 14px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: background-color 0.2s; } #chzzk-downloader-main-btn:hover { background-color: var(--chzzk-green-darker); } .chzzk-downloader-modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center; } .chzzk-downloader-modal-content { background-color: var(--chzzk-surface-1); color: var(--chzzk-text-primary); border-radius: 12px; width: 640px; max-width: 90%; box-shadow: 0 8px 30px rgba(0,0,0,0.5); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--chzzk-border-color); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif; } .modal-header { display: flex; align-items: center; gap: 8px; padding: 20px; background-color: var(--chzzk-surface-2); font-size: 18px; font-weight: bold; } .modal-header svg { width: 24px; height: 24px; color: var(--chzzk-green); } .modal-body { display: flex; height: 320px; } .modal-main-panel { flex-grow: 1; padding: 25px; text-align: center; border-right: 1px solid var(--chzzk-border-color); display: flex; flex-direction: column; } .modal-side-panel { width: 220px; min-width: 220px; background-color: var(--chzzk-background); display: flex; flex-direction: column; } .side-panel-content { flex-grow: 1; display: flex; flex-direction: column; padding: 25px; } .modal-video-title { font-size: 16px; font-weight: bold; margin-bottom: 8px; line-height: 1.4; color: var(--chzzk-text-primary); } .modal-video-info { font-size: 13px; color: var(--chzzk-text-secondary); margin-bottom: 15px; } .modal-split-section { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 15px 0; padding: 12px; background-color: var(--chzzk-background); border-radius: 8px; font-size: 13px; } .modal-split-section > div { display: none; align-items: center; gap: 8px; } .modal-split-section input[type=number] { width: 60px; text-align: center; background: #222; border: 1px solid #555; color: var(--chzzk-text-primary); padding: 5px; border-radius: 5px; } .modal-split-section select { background: #222; border: 1px solid #555; color: var(--chzzk-text-primary); padding: 4px; border-radius: 5px; } .modal-button { width: 100%; background-color: var(--chzzk-green); color: var(--chzzk-background); border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold; transition: background-color 0.2s; margin-top: auto; } .modal-button:hover:not(:disabled) { background-color: var(--chzzk-green-darker); } .modal-button:disabled { background-color: var(--chzzk-button-disabled); color: #888; cursor: not-allowed; } .modal-side-panel .modal-button { font-size: 14px; padding: 10px; background-color: var(--chzzk-surface-2); color: var(--chzzk-text-primary); } .modal-side-panel .modal-button:hover:not(:disabled) { background-color: #4e4e54; } .modal-side-panel .modal-button.save-btn { background-color: var(--chzzk-green); color: var(--chzzk-background); } .modal-side-panel .modal-button.save-btn:hover:not(:disabled) { background-color: var(--chzzk-green-darker); } .modal-progress-container { display: none; margin-top: 20px; } .modal-progress-bar-bg { background-color: var(--chzzk-border-color); border-radius: 5px; height: 10px; overflow: hidden; } .modal-progress-bar { width: 0%; height: 100%; background-color: var(--chzzk-green); transition: width 0.2s ease; } .modal-status-text { margin-top: 8px; font-size: 12px; color: var(--chzzk-text-secondary); height: 16px; } .cookie-settings-panel label { display: block; margin-bottom: 5px; font-size: 13px; text-align: left; } .cookie-settings-panel input { width: 100%; background: var(--chzzk-surface-1); border: 1px solid #555; color: var(--chzzk-text-primary); padding: 8px; border-radius: 5px; margin-bottom: 15px; box-sizing: border-box; } .cookie-settings-panel .button-group { display: flex; gap: 8px; margin-top: auto; } .modal-footer { padding: 15px; text-align: right; background-color: var(--chzzk-surface-2); border-top: 1px solid var(--chzzk-border-color); } .modal-close-button { background: none; border: none; color: var(--chzzk-text-tertiary); font-size: 24px; cursor: pointer; line-height: 1; }`); }
        createMainButton() { /* ... */ const button = document.createElement('button'); button.id = 'chzzk-downloader-main-btn'; button.textContent = '📥 VOD 다운로드'; button.addEventListener('click', () => this.openModal()); document.body.appendChild(button); }
        openModal() { if (document.getElementById('chzzk-downloader-modal')) return; const modalHTML = ` <div class="chzzk-downloader-modal-content"> <div class="modal-header"> <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M5 20h14v-2H5v2zm14-9h-4V3H9v8H5l7 7 7-7z"></path></svg> <span>VOD 다운로더</span> </div> <div class="modal-body"> <div class="modal-main-panel"> <div class="modal-video-title">...</div> <div class="modal-video-info">...</div> <div class="modal-split-section"> <label><input type="checkbox" id="split-checkbox"> 파일 분할하기</label> <div id="split-options" style="display: none;"> <input type="number" id="split-size-input" value="4" min="1"> <select id="split-unit-select"><option value="GB" selected>GB</option><option value="MB">MB</option></select> </div> </div> <button id="modal-start-download-btn" class="modal-button" disabled>다운로드 시작</button> <div class="modal-progress-container"> <div class="modal-progress-bar-bg"><div class="modal-progress-bar"></div></div> <div class="modal-status-text"></div> </div> </div> <div class="modal-side-panel"> <div id="side-panel-default" class="side-panel-content"> <button id="modal-cookie-settings-btn" class="modal-button">쿠키 설정</button> </div> <div id="side-panel-settings" class="side-panel-content cookie-settings-panel" style="display: none;"> <label for="nid_aut_input">NID_AUT</label> <input type="password" id="nid_aut_input" placeholder="NID_AUT 값을 붙여넣기"> <label for="nid_ses_input">NID_SES</label> <input type="password" id="nid_ses_input" placeholder="NID_SES 값을 붙여넣기"> <div class="button-group"> <button id="modal-back-btn" class="modal-button">뒤로</button> <button id="modal-save-cookie-btn" class="modal-button save-btn">저장</button> </div> </div> </div> </div> <div class="modal-footer"><button class="modal-close-button">×</button></div> </div>`; const modal = document.createElement('div'); modal.id = 'chzzk-downloader-modal'; modal.className = 'chzzk-downloader-modal-backdrop'; modal.innerHTML = modalHTML; document.body.appendChild(modal); this.cacheUIElements(modal); this.addModalEventListeners(); this.loadAndDisplayVideoInfo(); }
        cacheUIElements(modal) { this.ui = { modal, videoTitle: modal.querySelector('.modal-video-title'), videoInfo: modal.querySelector('.modal-video-info'), startBtn: modal.querySelector('#modal-start-download-btn'), progressContainer: modal.querySelector('.modal-progress-container'), progressBar: modal.querySelector('.modal-progress-bar'), statusText: modal.querySelector('.modal-status-text'), cookieSettingsBtn: modal.querySelector('#modal-cookie-settings-btn'), splitCheckbox: modal.querySelector('#split-checkbox'), splitOptions: modal.querySelector('#split-options'), sidePanelDefault: modal.querySelector('#side-panel-default'), sidePanelSettings: modal.querySelector('#side-panel-settings'), saveCookieBtn: modal.querySelector('#modal-save-cookie-btn'), backBtn: modal.querySelector('#modal-back-btn') }; }
        addModalEventListeners() { this.ui.modal.querySelector('.modal-close-button').addEventListener('click', () => this.closeModal()); this.ui.modal.addEventListener('click', e => { if (e.target === this.ui.modal) this.closeModal(); }); this.ui.startBtn.addEventListener('click', () => this.startStreamingDownload()); this.ui.cookieSettingsBtn.addEventListener('click', () => this.toggleSidePanel(true)); this.ui.backBtn.addEventListener('click', () => this.toggleSidePanel(false)); this.ui.saveCookieBtn.addEventListener('click', () => this.saveCookies()); this.ui.splitCheckbox.addEventListener('change', e => { this.ui.splitOptions.style.display = e.target.checked ? 'flex' : 'none'; }); }
        closeModal() { if (this.isDownloading && !confirm('다운로드가 진행 중입니다. 정말로 취소하시겠습니까?')) return; this.cancelDownload = true; this.ui.modal?.remove(); }
        toggleSidePanel(showSettings) { this.ui.sidePanelDefault.style.display = showSettings ? 'none' : 'flex'; this.ui.sidePanelSettings.style.display = showSettings ? 'flex' : 'none'; if (showSettings) { this.ui.modal.querySelector('#nid_aut_input').value = GM_getValue('NID_AUT', ''); this.ui.modal.querySelector('#nid_ses_input').value = GM_getValue('NID_SES', ''); } }
        saveCookies() { const nidAut = this.ui.modal.querySelector('#nid_aut_input').value.trim(); const nidSes = this.ui.modal.querySelector('#nid_ses_input').value.trim(); if (nidAut && nidSes) { GM_setValue('NID_AUT', nidAut); GM_setValue('NID_SES', nidSes); alert('쿠키가 안전하게 저장되었습니다.'); this.toggleSidePanel(false); } else { alert('NID_AUT와 NID_SES 값을 모두 입력해주세요.'); } }
        updateStatus(text, isError = false) { if (!this.ui.statusText) return; this.ui.statusText.textContent = text; this.ui.statusText.style.color = isError ? '#e74c3c' : 'var(--chzzk-text-secondary)'; }

        // ⭐️ [개선] 진행률 표시를 시간 기반으로 변경
        updateProgress(downloadedCount, totalSegments) {
            const percentage = totalSegments > 0 ? (downloadedCount / totalSegments) * 100 : 0;
            if (this.ui.progressBar) this.ui.progressBar.style.width = `${Math.min(percentage, 100)}%`;

            const estimatedCurrentSeconds = downloadedCount * 4;
            const formattedCurrent = this._secondsToHHMMSS(estimatedCurrentSeconds);
            const formattedTotal = this._secondsToHHMMSS(this.videoInfo.duration);
            this.updateStatus(`다운로드 중: ${formattedCurrent} / ${formattedTotal}`);
        }

        fetchWithGM(url, options = {}) { return new Promise((resolve, reject) => { GM_xmlhttpRequest({ method: 'GET', url, headers: { ...options.headers, 'Cookie': `NID_AUT=${GM_getValue('NID_AUT', '')}; NID_SES=${GM_getValue('NID_SES', '')}` }, responseType: options.responseType || 'json', onload: resp => (resp.status >= 200 && resp.status < 300) ? resolve(options.responseType === 'arraybuffer' ? resp.response : JSON.parse(resp.responseText)) : reject({ status: resp.status }), onerror: () => reject(new Error('네트워크 오류')), ontimeout: () => reject(new Error('요청 시간 초과')) }); }); }

        async loadAndDisplayVideoInfo() {
            try {
                this.updateStatus('VOD 정보 분석 중...');
                const videoNo = location.pathname.split('/').pop(); if (!videoNo || isNaN(videoNo)) throw new Error('올바른 VOD 페이지가 아닙니다.');
                const data = await this.fetchWithGM(`https://api.chzzk.naver.com/service/v3/videos/${videoNo}`);
                const content = data.content; if (!content) throw new Error("API에서 유효한 데이터를 받지 못했습니다.");
                await new Promise(r => setTimeout(r, 500));
                const tsUrlEntry = performance.getEntriesByType('resource').find(r => r.name.includes('.ts') && r.name.includes('pstatic.net/glive/c/read'));
                if (!tsUrlEntry) throw new Error('.ts 파일 주소를 찾지 못했습니다. VOD를 1~2초 재생하고 다시 시도하세요.');
                const match = tsUrlEntry.name.match(/(.*\/)([^/]+)-(\d+)\.ts(\?.*)/); if (!match) throw new Error('URL 형식이 예상과 다릅니다.');
                const publishDate = content.publishDate.substring(0, 10).replace(/-/g, '');

                this.videoInfo = {
                    baseUrl: match[1], uuid: match[2], numPadding: match[3].length, query: match[4],
                    title: content.videoTitle,
                    fileName: `${content.channel.channelName}_${publishDate}_${content.videoTitle}`.replace(/[\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim(),
                    totalSegments: Math.ceil(content.duration / 4),
                    duration: content.duration // ⭐️ [개선] 총 길이를 초 단위로 저장
                };

                // ⭐️ [개선] 정보 표시에 총 길이(시간) 사용
                const totalDurationStr = this._secondsToHHMMSS(this.videoInfo.duration);
                this.ui.videoTitle.textContent = this.videoInfo.title;
                this.ui.videoInfo.textContent = `채널: ${content.channel.channelName} | 총 길이: ${totalDurationStr}`;
                this.ui.startBtn.disabled = false;

            } catch (error) { this.ui.videoTitle.textContent = '오류'; this.ui.videoInfo.textContent = error.status === 401 ? '쿠키가 유효하지 않습니다. 다시 설정해주세요.' : (error.message || '알 수 없는 오류 발생'); this.ui.startBtn.disabled = true; }
        }

        createFileStream(part) { const partString = this.splitOptions.enabled ? `_part${part}` : ''; const fileName = `${this.videoInfo.fileName}${partString}.ts`; this.updateStatus(`파일 쓰기 시작: ${fileName.length > 30 ? '...' + fileName.slice(-27) : fileName}`); return streamSaver.createWriteStream(fileName); }
        async startStreamingDownload() {
            if (!GM_getValue('NID_AUT')) { alert('쿠키가 설정되지 않았습니다.'); return; }
            this.isDownloading = true; this.cancelDownload = false;
            this.ui.startBtn.disabled = true; this.ui.progressContainer.style.display = 'block';

            this.splitOptions = { enabled: this.ui.splitCheckbox.checked, size: parseFloat(this.ui.modal.querySelector('#split-size-input').value), unit: this.ui.modal.querySelector('#split-unit-select').value };
            const maxSizeBytes = this.splitOptions.enabled ? this.splitOptions.size * (this.splitOptions.unit === 'GB' ? 1024 * 1024 * 1024 : 1024 * 1024) : Infinity;

            let filePartCounter = 1, currentFileSize = 0;
            let fileStream = this.createFileStream(filePartCounter);
            let writer = fileStream.getWriter();

            const segmentQueue = Array.from({ length: this.videoInfo.totalSegments + 5 }, (_, i) => i);
            let downloadedCount = 0, writeIndex = 0;
            const downloadedChunks = new Map();

            const worker = async () => {
                while (true) {
                    const segmentIndex = segmentQueue.shift();
                    if (segmentIndex === undefined || this.cancelDownload) break;
                    const url = `${this.videoInfo.baseUrl}${this.videoInfo.uuid}-${String(segmentIndex).padStart(this.videoInfo.numPadding, '0')}.ts${this.videoInfo.query}`;
                    try { const arrayBuffer = await this.fetchWithGM(url, { responseType: 'arraybuffer' }); downloadedChunks.set(segmentIndex, new Uint8Array(arrayBuffer)); }
                    catch (e) { downloadedChunks.set(segmentIndex, 'FAILED'); break; }
                }
            };

            const writerLoop = async () => {
                while (writeIndex < this.videoInfo.totalSegments) {
                    if (this.cancelDownload) break;
                    if (downloadedChunks.has(writeIndex)) {
                        const chunk = downloadedChunks.get(writeIndex); downloadedChunks.delete(writeIndex);
                        if (chunk === 'FAILED') { this.updateStatus(`세그먼트 #${writeIndex} 다운로드 실패.`, true); this.cancelDownload = true; break; }
                        if (this.splitOptions.enabled && currentFileSize + chunk.byteLength > maxSizeBytes && downloadedCount > 0) {
                            await writer.close(); filePartCounter++; currentFileSize = 0; fileStream = this.createFileStream(filePartCounter); writer = fileStream.getWriter();
                        }
                        await writer.write(chunk); currentFileSize += chunk.byteLength;
                        downloadedCount++;
                        this.updateProgress(downloadedCount, this.videoInfo.totalSegments); // ⭐️ 여기서 시간 기반으로 업데이트
                        writeIndex++;
                    } else { await new Promise(r => setTimeout(r, 50)); }
                }
            };

            const workers = Array(CONFIG.PARALLEL_REQUESTS).fill(null).map(worker);
            await Promise.all([...workers, writerLoop()]);

            if (!this.cancelDownload && downloadedCount > 0) {
                await writer.close();
                this.updateStatus(`스트리밍 완료! (${downloadedCount}개 세그먼트)`);
            } else {
                await writer.abort().catch(()=>{}); if (!this.cancelDownload) this.updateStatus('다운로드에 실패했습니다.', true);
            }
            this.isDownloading = false; this.ui.startBtn.disabled = false;
        }
    }

    new ChzzkDownloader().init();

})();
