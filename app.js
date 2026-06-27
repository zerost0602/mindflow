// ==========================================
// MindFlow CBT 감정일기 - 클라이언트 엔진
// ==========================================

// --- 전역 상태 및 데이터 스토어 ---
let state = {
  entries: [],             // 전체 일기 목록
  currentMood: null,       // 선택된 기분 (1~5)
  selectedActivities: [],  // 선택된 활동들
  selectedEmotions: new Set(), // 선택된 미세 감정들
  bodyMap: {               // 신체 감각 강도 (0: 없음, 1: 약함, 2: 중간, 3: 강함)
    head: 0,
    neck: 0,
    chest: 0,
    stomach: 0,
    leftArm: 0,
    rightArm: 0,
    leftLeg: 0,
    rightLeg: 0
  },
  currentDate: new Date(),  // 인사이트 달력 기준 날짜
  supabaseClient: null,    // Supabase 인스턴스
  isSyncMode: false        // 동기화 모드 여부
};

// --- 감정 단어 사전 (CBT & 뇌과학 기반 세부 감정 어휘) ---
const emotionDictionary = {
  sadness: ['서운함', '좌절감', '외로움', '상실감', '허탈함', '우울함', '서글픔', '낙담함', '비장함'],
  anger: ['억울함', '짜증', '분노', '배신감', '답답함', '적대감', '신경질', '분개함', '불만족'],
  anxiety: ['두려움', '초조함', '긴장됨', '걱정', '무서움', '공황', '혼란', '불안정', '조마조마함'],
  joy: ['감사함', '평온함', '뿌듯함', '설렘', '기쁨', '행복함', '든든함', '안도감', '신남'],
  hurt: ['거절당함', '소외감', '배신감', '비참함', '자괴감', '부끄러움', '죄책감', '모욕감', '초라함'],
  lethargy: ['무기력함', '피로함', '멍함', '공허함', '귀찮음', '지루함', '지침', '맥빠짐', '무감각']
};

// --- 차트 인스턴스 보관 ---
let trendChartInstance = null;
let correlationChartInstance = null;
let distortionChartInstance = null;

// ==========================================
// 1. 초기화 및 이벤트 리스너 설정
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  // Lucide 아이콘 초기화
  lucide.createIcons();
  
  // 1) 저장된 Supabase 설정 로드 및 초기화 시도
  await loadAndInitSupabase();
  
  // 2) 데이터 불러오기 (Supabase 혹은 로컬)
  await refreshEntries();

  // 3) UI 바인딩 및 렌더링
  initTabNavigation();
  initFormInteractions();
  initBodyMap();
  initCalendar();
  
  // 초기 화면 렌더링
  updateSyncBadge();
  renderTimeline();
});

// ==========================================
// 2. 탭 네비게이션 및 UI 화면 전환
// ==========================================
function initTabNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTabId = item.getAttribute('data-tab');
      
      // 네비게이션 바 활성화 변경
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // 탭 콘텐츠 전환
      tabPanes.forEach(pane => pane.classList.remove('active'));
      const activePane = document.getElementById(targetTabId);
      activePane.classList.add('active');
      
      // 특정 탭 이동 시 특수 렌더링
      if (targetTabId === 'tab-insights') {
        renderInsights();
      } else if (targetTabId === 'tab-history') {
        renderTimeline();
      }
    });
  });
}

// ==========================================
// 3. 기록하기 폼 & 위저드 & 감정 바퀴 인터랙션
// ==========================================
function initFormInteractions() {
  const form = document.getElementById('diaryForm');
  
  // 기분 버튼 선택
  const moodButtons = document.querySelectorAll('.mood-btn');
  moodButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      moodButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentMood = parseInt(btn.getAttribute('data-mood'));
    });
  });

  // Step 1 -> Step 2 이동
  document.getElementById('btn-go-step2').addEventListener('click', () => {
    if (!state.currentMood) {
      alert('오늘의 기분 점수를 선택해 주세요!');
      return;
    }
    showStep(2);
  });

  // Step 1에서 초간편 완료
  document.getElementById('btn-quick-submit').addEventListener('click', async () => {
    if (!state.currentMood) {
      alert('오늘의 기분 점수를 선택해 주세요!');
      return;
    }
    await saveDiaryEntry(true); // 저에너지 퀵 저장
  });

  // Step 2 내비게이션
  document.getElementById('btn-back-step1').addEventListener('click', () => showStep(1));
  document.getElementById('btn-go-step3').addEventListener('click', () => showStep(3));

  // Step 3 내비게이션
  document.getElementById('btn-back-step2').addEventListener('click', () => showStep(2));
  document.getElementById('btn-go-step4').addEventListener('click', () => showStep(4));

  // Step 4 내비게이션
  document.getElementById('btn-back-step3').addEventListener('click', () => showStep(3));

  // 감정 바퀴 카테고리 클릭
  const catButtons = document.querySelectorAll('.em-cat-btn');
  const subWordsContainer = document.getElementById('subWordsContainer');
  const subWordsList = document.getElementById('subWordsList');

  catButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      catButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const cat = btn.getAttribute('data-cat');
      renderSubWords(cat);
      subWordsContainer.classList.remove('hidden');
    });
  });

  // 최종 폼 제출
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveDiaryEntry(false); // 전체 저장
  });
  
  // 모달 닫기
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('detailModal').querySelector('.modal-overlay').addEventListener('click', closeModal);
}

// 탭/단계 제어
function showStep(stepNum) {
  for (let i = 1; i <= 4; i++) {
    const stepEl = document.getElementById(`step-${i}`);
    if (i === stepNum) {
      stepEl.classList.remove('hidden');
      stepEl.scrollIntoView({ behavior: 'smooth' });
    } else {
      stepEl.classList.add('hidden');
    }
  }
}

// 세부 감정 렌더링
function renderSubWords(category) {
  const subWordsList = document.getElementById('subWordsList');
  subWordsList.innerHTML = '';
  
  const words = emotionDictionary[category] || [];
  words.forEach(word => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `em-word-pill ${state.selectedEmotions.has(word) ? 'active' : ''}`;
    button.textContent = word;
    
    button.addEventListener('click', () => {
      if (state.selectedEmotions.has(word)) {
        state.selectedEmotions.delete(word);
        button.classList.remove('active');
      } else {
        state.selectedEmotions.add(word);
        button.classList.add('active');
      }
      renderSelectedEmotionTags();
    });
    
    subWordsList.appendChild(button);
  });
}

// 선택된 감정 태그 렌더링
function renderSelectedEmotionTags() {
  const display = document.getElementById('selectedEmotionsDisplay');
  display.innerHTML = '';
  
  state.selectedEmotions.forEach(word => {
    const tag = document.createElement('span');
    tag.className = 'selected-emotion-tag';
    tag.innerHTML = `${word} <span class="remove-tag">&times;</span>`;
    
    tag.querySelector('.remove-tag').addEventListener('click', () => {
      state.selectedEmotions.delete(word);
      renderSelectedEmotionTags();
      // 만약 세부 단어가 화면에 렌더링 중이면 액티브 갱신
      const activeCategoryBtn = document.querySelector('.em-cat-btn.active');
      if (activeCategoryBtn) {
        renderSubWords(activeCategoryBtn.getAttribute('data-cat'));
      }
    });
    
    display.appendChild(tag);
  });
}

// ==========================================
// 4. 신체 감각 실루엣 맵핑 인터랙션
// ==========================================
function initBodyMap() {
  const parts = document.querySelectorAll('#bodySilhouette .body-part');
  
  parts.forEach(part => {
    const partName = part.getAttribute('data-part');
    // 강도 초기화
    part.setAttribute('data-intensity', '0');
    
    part.addEventListener('click', () => {
      // 강도 0 -> 1 -> 2 -> 3 -> 0 순환
      let currentIntensity = parseInt(part.getAttribute('data-intensity') || '0');
      let nextIntensity = (currentIntensity + 1) % 4;
      
      part.setAttribute('data-intensity', nextIntensity.toString());
      state.bodyMap[partName] = nextIntensity;
    });
  });
}

// ==========================================
// 5. Supabase 클라우드 연동 로직
// ==========================================
async function loadAndInitSupabase() {
  const url = localStorage.getItem('mindflow_supabase_url');
  const key = localStorage.getItem('mindflow_supabase_key');
  
  const statusInputUrl = document.getElementById('supabaseUrl');
  const statusInputKey = document.getElementById('supabaseKey');
  
  if (url && key) {
    statusInputUrl.value = url;
    statusInputKey.value = key;
    try {
      state.supabaseClient = supabase.createClient(url, key);
      // 단순 쿼리로 연결성 체크
      const { error } = await state.supabaseClient
        .from('diary_entries')
        .select('id')
        .limit(1);
        
      if (error) throw error;
      
      state.isSyncMode = true;
      console.log('Supabase 클라우드 동기화 모드 활성화 성공');
    } catch (e) {
      console.error('Supabase 연결 오류, 로컬 모드로 전환:', e);
      state.supabaseClient = null;
      state.isSyncMode = false;
    }
  } else {
    state.isSyncMode = false;
  }
  
  // 설정 탭 내 이벤트 등록
  document.getElementById('btn-save-sync').addEventListener('click', saveSyncSettings);
  document.getElementById('btn-disconnect-sync').addEventListener('click', disconnectSync);
}

function updateSyncBadge() {
  const badge = document.getElementById('syncBadge');
  const badgeText = document.getElementById('syncBadgeText');
  
  if (state.isSyncMode) {
    badge.classList.add('online');
    badgeText.textContent = '클라우드 동기화';
  } else {
    badge.classList.remove('online');
    badgeText.textContent = '로컬 모드';
  }
}

// 설정 저장 및 마이그레이션
async function saveSyncSettings() {
  const url = document.getElementById('supabaseUrl').value.trim();
  const key = document.getElementById('supabaseKey').value.trim();
  const messageEl = document.getElementById('settings-status-message');
  
  if (!url || !key) {
    showSettingsMessage('URL과 API Key를 입력해 주세요.', 'error');
    return;
  }
  
  showSettingsMessage('연동 테스트 중입니다...', 'success');
  
  try {
    const testClient = supabase.createClient(url, key);
    // 테이블 연결 테스트
    const { error } = await testClient.from('diary_entries').select('id').limit(1);
    
    if (error) throw error;
    
    // 연결 성공 -> 스토리지 저장
    localStorage.setItem('mindflow_supabase_url', url);
    localStorage.setItem('mindflow_supabase_key', key);
    state.supabaseClient = testClient;
    state.isSyncMode = true;
    updateSyncBadge();
    
    // 로컬 데이터를 클라우드로 마이그레이션(동기화) 유도
    const localEntries = JSON.parse(localStorage.getItem('mindflow_diary_entries') || '[]');
    if (localEntries.length > 0) {
      showSettingsMessage('연동 성공! 기존 로컬 데이터를 클라우드 데이터베이스로 업로드(동기화) 중입니다...', 'success');
      
      // 중복 방지를 위한 날짜 확인 또는 일괄 인서트
      for (const entry of localEntries) {
        // 기존 클라우드에 동일 날짜 데이터가 있는지 체크
        const { data } = await testClient.from('diary_entries').select('id').eq('date', entry.date);
        if (!data || data.length === 0) {
          // 구조 일치화 후 업로드
          const { id, created_at, ...cleanEntry } = entry;
          await testClient.from('diary_entries').insert([cleanEntry]);
        }
      }
      
      // 마이그레이션 완료 후 로컬 캐시 클리어 (충돌 방지)
      localStorage.removeItem('mindflow_diary_entries');
    }
    
    showSettingsMessage('연동 및 데이터 동기화가 성공적으로 완료되었습니다!', 'success');
    await refreshEntries();
    renderTimeline();
    
  } catch (e) {
    console.error(e);
    showSettingsMessage(`연동 실패: ${e.message || 'API 정보 혹은 SQL 테이블 설정을 확인하세요.'}`, 'error');
  }
}

// 연동 해제
function disconnectSync() {
  if (confirm('클라우드 연동을 해제하시겠습니까? 데이터는 클라우드에 계속 남아있으며, 이후 기록은 이 브라우저(로컬)에만 저장됩니다.')) {
    localStorage.removeItem('mindflow_supabase_url');
    localStorage.removeItem('mindflow_supabase_key');
    state.supabaseClient = null;
    state.isSyncMode = false;
    updateSyncBadge();
    
    document.getElementById('supabaseUrl').value = '';
    document.getElementById('supabaseKey').value = '';
    
    showSettingsMessage('연동이 해제되었습니다. 로컬 모드로 전환됩니다.', 'success');
    refreshEntries().then(() => {
      renderTimeline();
    });
  }
}

function showSettingsMessage(text, type) {
  const el = document.getElementById('settings-status-message');
  el.className = `settings-message ${type}`;
  el.textContent = text;
}

// ==========================================
// 6. 데이터 입출력 (CRUD)
// ==========================================
async function refreshEntries() {
  if (state.isSyncMode && state.supabaseClient) {
    try {
      const { data, error } = await state.supabaseClient
        .from('diary_entries')
        .select('*')
        .order('date', { ascending: false });
        
      if (error) throw error;
      state.entries = data || [];
    } catch (e) {
      console.error('Supabase 데이터 로드 실패, 로컬 캐시 이용:', e);
      loadLocalEntries();
    }
  } else {
    loadLocalEntries();
  }
}

function loadLocalEntries() {
  state.entries = JSON.parse(localStorage.getItem('mindflow_diary_entries') || '[]');
  // 날짜 기준 정렬 (최신순)
  state.entries.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// 일기 저장 처리
async function saveDiaryEntry(isQuickMode = false) {
  // 오늘 날짜 문자열 만들기 (로컬 타임존 YYYY-MM-DD)
  const todayStr = getLocalDateString(new Date());
  
  // 감사 일기 취합
  const gratitudeArr = [];
  if (!isQuickMode) {
    const grat1 = document.querySelector('input[name="gratitude1"]').value.trim();
    const grat2 = document.querySelector('input[name="gratitude2"]').value.trim();
    const grat3 = document.querySelector('input[name="gratitude3"]').value.trim();
    if (grat1) gratitudeArr.push(grat1);
    if (grat2) gratitudeArr.push(grat2);
    if (grat3) gratitudeArr.push(grat3);
  }

  // 인지 왜곡 취합
  const distortionArr = [];
  if (!isQuickMode) {
    const checkboxes = document.querySelectorAll('input[name="cbtDistortions"]:checked');
    checkboxes.forEach(cb => distortionArr.push(cb.value));
  }

  // 데이터 모델 구조화
  const diaryData = {
    date: todayStr,
    mood: state.currentMood,
    activities: Array.from(document.querySelectorAll('input[name="activities"]:checked')).map(cb => cb.value),
    emotions: isQuickMode ? [] : Array.from(state.selectedEmotions),
    body_map: isQuickMode ? {} : { ...state.bodyMap },
    cbt_event: isQuickMode ? '' : document.getElementById('cbtEvent').value.trim(),
    cbt_thought: isQuickMode ? '' : document.getElementById('cbtThought').value.trim(),
    cbt_distortions: distortionArr,
    cbt_alternative: isQuickMode ? '' : document.getElementById('cbtAlternative').value.trim(),
    gratitude: gratitudeArr
  };

  try {
    if (state.isSyncMode && state.supabaseClient) {
      // 1) 클라우드 모드: Supabase에 Upsert (동일 날짜 존재 시 덮어쓰기 권장 혹은 단순 생성)
      // 여기서는 사용자 편의를 위해 같은 날짜에 또 저장하면 기존 데이터 업데이트(또는 덮어쓰기)하도록 구현
      const { data: existing } = await state.supabaseClient
        .from('diary_entries')
        .select('id')
        .eq('date', todayStr);
        
      if (existing && existing.length > 0) {
        // 기존 항목 업데이트
        const { error } = await state.supabaseClient
          .from('diary_entries')
          .update(diaryData)
          .eq('id', existing[0].id);
        if (error) throw error;
      } else {
        // 신규 인서트
        const { error } = await state.supabaseClient
          .from('diary_entries')
          .insert([diaryData]);
        if (error) throw error;
      }
    } else {
      // 2) 로컬 모드: localStorage에 저장
      let localEntries = JSON.parse(localStorage.getItem('mindflow_diary_entries') || '[]');
      const idx = localEntries.findIndex(e => e.date === todayStr);
      if (idx > -1) {
        localEntries[idx] = { ...localEntries[idx], ...diaryData, id: localEntries[idx].id || generateUUID() };
      } else {
        diaryData.id = generateUUID();
        diaryData.created_at = new Date().toISOString();
        localEntries.push(diaryData);
      }
      localStorage.setItem('mindflow_diary_entries', JSON.stringify(localEntries));
    }

    alert('오늘의 소중한 마음이 잘 저장되었습니다.');
    resetForm();
    
    // 타임라인 데이터 즉시 리프레시 후 저장소 탭으로 전환
    await refreshEntries();
    document.querySelector('.nav-item[data-tab="tab-history"]').click();

  } catch (e) {
    console.error('일기 저장 실패:', e);
    alert(`저장에 실패했습니다: ${e.message || '인터넷 연결을 확인하세요.'}`);
  }
}

// 폼 초기화
function resetForm() {
  document.getElementById('diaryForm').reset();
  state.currentMood = null;
  state.selectedEmotions.clear();
  renderSelectedEmotionTags();
  
  // 기분 단추들 선택 상태 지우기
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
  
  // 실루엣 지우기
  document.querySelectorAll('#bodySilhouette .body-part').forEach(part => {
    part.setAttribute('data-intensity', '0');
  });
  Object.keys(state.bodyMap).forEach(k => state.bodyMap[k] = 0);

  // 감정 바퀴 세부 접기
  document.querySelectorAll('.em-cat-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('subWordsContainer').classList.add('hidden');

  showStep(1);
}

// 유틸리티 날짜 변환 (YYYY-MM-DD)
function getLocalDateString(date) {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
}

// UUID 생성기 (로컬 저장용 고유 키)
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ==========================================
// 7. 마음 저장소 (타임라인) 렌더링
// ==========================================
function renderTimeline() {
  const timeline = document.getElementById('historyTimeline');
  timeline.innerHTML = '';
  
  if (state.entries.length === 0) {
    timeline.innerHTML = `
      <div class="empty-state" style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
        <i data-lucide="inbox" style="width: 48px; height: 48px; stroke-width: 1; margin-bottom: 12px; color: var(--primary);"></i>
        <p style="font-size: 14px;">아직 저장된 감정일기가 없습니다.<br>오늘의 기록 탭에서 첫 마음 일기를 작성해 보세요.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  state.entries.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'history-card';
    card.addEventListener('click', () => openDetailModal(entry));
    
    // 기분 라벨 정의
    const moodLabels = { 1: '최악 😭', 2: '나쁨 🙁', 3: '보통 😐', 4: '좋음 🙂', 5: '최고 😄' };
    
    // 뇌과학 CBT 작성 여부 뱃지 처리
    const hasCbt = entry.cbt_event || entry.cbt_thought || entry.cbt_alternative;
    const hasGratitude = entry.gratitude && entry.gratitude.length > 0;
    
    let summaryText = '';
    if (entry.cbt_thought) {
      summaryText = `자동적 사고: "${entry.cbt_thought}"`;
    } else if (hasGratitude) {
      summaryText = `감사일기: "${entry.gratitude[0]}"...`;
    } else if (entry.activities && entry.activities.length > 0) {
      summaryText = `활동 요약: ${entry.activities.join(', ')}`;
    } else {
      summaryText = '하루 체크인 완료';
    }

    card.innerHTML = `
      <div class="card-top">
        <span class="card-date">${formatKoreanDate(entry.date)}</span>
        <span class="card-mood-badge m${entry.mood}">${moodLabels[entry.mood]}</span>
      </div>
      <div class="card-summary-text">${summaryText}</div>
      <div class="card-tags">
        ${entry.activities.slice(0, 3).map(a => `<span class="card-tag">${a}</span>`).join('')}
        ${entry.emotions.slice(0, 2).map(e => `<span class="card-tag" style="background-color: var(--primary-light); color: var(--primary);">${e}</span>`).join('')}
        ${hasCbt ? '<span class="card-tag cbt-flag">CBT 인지치료</span>' : ''}
        ${hasGratitude ? '<span class="card-tag" style="background-color:#E2F0CB; color:#4C6934;">감사일기</span>' : ''}
      </div>
    `;
    
    timeline.appendChild(card);
  });
  
  lucide.createIcons();
}

function formatKoreanDate(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[0]}년 ${parseInt(parts[1])}월 ${parseInt(parts[2])}일`;
  }
  return dateStr;
}

// ==========================================
// 8. 일기 상세 보기 모달 구현
// ==========================================
function openDetailModal(entry) {
  const modal = document.getElementById('detailModal');
  const content = document.getElementById('modal-body-content');
  
  const moodLabels = { 1: '최악 😭', 2: '나쁨 🙁', 3: '보통 😐', 4: '좋음 🙂', 5: '최고 😄' };
  
  let cbtHtml = '';
  if (entry.cbt_event || entry.cbt_thought || entry.cbt_alternative) {
    cbtHtml = `
      <div class="modal-detail-section">
        <h4><i data-lucide="brain-circuit" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"></i> CBT 생각기록 분석</h4>
        <div class="modal-cbt-box">
          <div class="modal-cbt-flow-item">
            <span class="label">1. 객관적 상황</span>
            <div class="content">${entry.cbt_event || '기록 없음'}</div>
          </div>
          <div class="modal-cbt-flow-item">
            <span class="label">2. 스쳐 지나간 생각 (자동적 사고)</span>
            <div class="content">${entry.cbt_thought || '기록 없음'}</div>
          </div>
          ${entry.cbt_distortions && entry.cbt_distortions.length > 0 ? `
            <div class="modal-cbt-flow-item">
              <span class="label">3. 발견된 인지 왜곡</span>
              <div class="content" style="border-left-color: var(--secondary);">
                ${entry.cbt_distortions.map(d => `<span class="card-tag" style="background:#EEF1FF; color:#555A9E; font-weight:700; margin-right:4px;">${d}</span>`).join('')}
              </div>
            </div>
          ` : ''}
          <div class="modal-cbt-flow-item">
            <span class="label">4. 친구에게 들려준 조언과 대안 사고</span>
            <div class="content" style="border-left-color: var(--success);">${entry.cbt_alternative || '기록 없음'}</div>
          </div>
        </div>
      </div>
    `;
  }

  let gratitudeHtml = '';
  if (entry.gratitude && entry.gratitude.length > 0) {
    gratitudeHtml = `
      <div class="modal-detail-section">
        <h4><i data-lucide="heart" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"></i> 감사한 순간들</h4>
        <ul style="padding-left: 20px; font-size:13px; color: var(--text-primary); display:flex; flex-direction:column; gap:6px;">
          ${entry.gratitude.map(item => `<li>${item}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  // 신체 지도 강도 검출
  const hasBodyMap = entry.body_map && Object.values(entry.body_map).some(v => v > 0);
  let bodyMapHtml = '';
  if (hasBodyMap) {
    bodyMapHtml = `
      <div class="modal-detail-section">
        <h4><i data-lucide="accessibility" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"></i> 느껴진 신체 영역</h4>
        <div class="modal-body-visualization">
          <svg viewBox="0 0 200 450" class="body-svg" style="height:180px;">
            <circle cx="100" cy="55" r="28" class="body-part-static" data-intensity="${entry.body_map.head || 0}" />
            <rect x="94" y="83" width="12" height="15" rx="3" class="body-part-static" data-intensity="${entry.body_map.neck || 0}" />
            <path d="M 50 120 C 50 98, 150 98, 150 120 L 140 180 L 60 180 Z" class="body-part-static" data-intensity="${entry.body_map.chest || 0}" />
            <path d="M 60 180 L 140 180 L 135 250 L 65 250 Z" class="body-part-static" data-intensity="${entry.body_map.stomach || 0}" />
            <path d="M 50 115 C 38 125, 20 180, 20 220 C 20 230, 32 230, 35 220 L 48 160 Z" class="body-part-static" data-intensity="${entry.body_map.leftArm || 0}" />
            <path d="M 150 115 C 162 125, 180 180, 180 220 C 180 230, 168 230, 165 220 L 152 160 Z" class="body-part-static" data-intensity="${entry.body_map.rightArm || 0}" />
            <path d="M 65 250 L 98 250 L 93 420 C 93 430, 75 430, 70 420 Z" class="body-part-static" data-intensity="${entry.body_map.leftLeg || 0}" />
            <path d="M 102 250 L 135 250 L 130 420 C 130 430, 112 430, 107 420 Z" class="body-part-static" data-intensity="${entry.body_map.rightLeg || 0}" />
            
            <text x="100" y="58" class="svg-text">머리</text>
            <text x="100" y="140" class="svg-text">가슴</text>
            <text x="100" y="215" class="svg-text">복부</text>
          </svg>
        </div>
      </div>
    `;
  }

  content.innerHTML = `
    <div class="modal-detail-header">
      <h3>${formatKoreanDate(entry.date)} 일기</h3>
      <span class="card-mood-badge m${entry.mood}" style="display:inline-block; margin-top:6px;">오늘 기분: ${moodLabels[entry.mood]}</span>
    </div>
    
    <div class="modal-detail-section">
      <h4><i data-lucide="check" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"></i> 수행한 활동</h4>
      <div class="card-tags" style="margin-top:6px;">
        ${entry.activities.length > 0 ? entry.activities.map(a => `<span class="card-tag">${a}</span>`).join('') : '<span class="card-tag">활동 체크 없음</span>'}
      </div>
    </div>

    ${entry.emotions && entry.emotions.length > 0 ? `
      <div class="modal-detail-section">
        <h4><i data-lucide="sparkles" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"></i> 포착된 미세 감정</h4>
        <div class="card-tags" style="margin-top:6px;">
          ${entry.emotions.map(e => `<span class="card-tag" style="background-color: var(--primary-light); color: var(--primary); font-weight:700;">${e}</span>`).join('')}
        </div>
      </div>
    ` : ''}

    <div style="display:grid; grid-template-columns: ${hasBodyMap ? '1fr 1.2fr' : '1fr'}; gap:14px; align-items: start;">
      ${cbtHtml}
      ${bodyMapHtml}
    </div>

    ${gratitudeHtml}
  `;

  // 모달 인체지도 정적 스타일링 연계
  setTimeout(() => {
    const staticParts = document.querySelectorAll('.body-part-static');
    staticParts.forEach(part => {
      const level = part.getAttribute('data-intensity') || '0';
      if (level === '1') {
        part.style.fill = 'rgba(254, 240, 138, 0.7)';
        part.style.stroke = '#EAB308';
      } else if (level === '2') {
        part.style.fill = 'rgba(253, 186, 116, 0.8)';
        part.style.stroke = '#F97316';
      } else if (level === '3') {
        part.style.fill = 'rgba(248, 113, 113, 0.85)';
        part.style.stroke = '#EF4444';
      } else {
        part.style.fill = 'rgba(220, 220, 220, 0.2)';
        part.style.stroke = '#CCC';
      }
    });
  }, 10);

  modal.classList.add('open');
  lucide.createIcons();
}

function closeModal() {
  document.getElementById('detailModal').classList.remove('open');
}

// ==========================================
// 9. 인사이트 (달력 & 통계 차트) 엔진
// ==========================================
function initCalendar() {
  document.getElementById('prev-month').addEventListener('click', () => {
    state.currentDate.setMonth(state.currentDate.getMonth() - 1);
    renderCalendar();
  });
  
  document.getElementById('next-month').addEventListener('click', () => {
    state.currentDate.setMonth(state.currentDate.getMonth() + 1);
    renderCalendar();
  });
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const monthYearText = document.getElementById('calendar-month-year');
  grid.innerHTML = '';
  
  const year = state.currentDate.getFullYear();
  const month = state.currentDate.getMonth();
  
  monthYearText.textContent = `${year}년 ${month + 1}월`;
  
  // 첫 날 요일 및 총 일수 계산
  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  
  // 1) 빈 공간 채우기
  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day empty';
    grid.appendChild(emptyCell);
  }
  
  // 오늘 날짜 문자열
  const realTodayStr = getLocalDateString(new Date());
  
  // 2) 날짜 박스 그리기
  for (let day = 1; day <= totalDays; day++) {
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day';
    dayCell.textContent = day;
    
    // 날짜 포맷팅 (YYYY-MM-DD)
    const monthStr = (month + 1).toString().padStart(2, '0');
    const dayStr = day.toString().padStart(2, '0');
    const cellDateStr = `${year}-${monthStr}-${dayStr}`;
    
    // 오늘인지 확인
    if (cellDateStr === realTodayStr) {
      dayCell.classList.add('today');
    }
    
    // 해당 날짜 일기 존재 확인 및 기분 채색
    const entry = state.entries.find(e => e.date === cellDateStr);
    if (entry) {
      dayCell.classList.add(`m${entry.mood}`);
      dayCell.addEventListener('click', () => openDetailModal(entry));
    }
    
    grid.appendChild(dayCell);
  }
}

function renderInsights() {
  // 캘린더 렌더링
  renderCalendar();
  
  // 최근 14개 데이터를 기준으로 트렌드 정렬 (과거 -> 현재 순)
  const chartData = [...state.entries]
    .slice(0, 14)
    .reverse();
    
  // --- 1. 기분 추이 선 그래프 ---
  const trendCtx = document.getElementById('trendChart').getContext('2d');
  if (trendChartInstance) trendChartInstance.destroy();
  
  trendChartInstance = new Chart(trendCtx, {
    type: 'line',
    data: {
      labels: chartData.map(e => {
        const parts = e.date.split('-');
        return `${parts[1]}/${parts[2]}`;
      }),
      datasets: [{
        label: '기분 지수',
        data: chartData.map(e => e.mood),
        borderColor: '#9B9ECE',
        backgroundColor: 'rgba(155, 158, 206, 0.1)',
        borderWidth: 3,
        tension: 0.3,
        pointBackgroundColor: '#9B9ECE',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 1,
          max: 5,
          ticks: {
            stepSize: 1,
            callback: (value) => {
              const labels = {1: '최악', 2: '나쁨', 3: '보통', 4: '좋음', 5: '최고'};
              return labels[value] || value;
            }
          }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });

  // --- 2. 활동과 감정 상관관계 분석 막대 그래프 ---
  const allActivities = ['수면', '운동', '식사', '취미', '대화', '휴식', '일/공부', '산책'];
  const correlationData = allActivities.map(act => {
    // 해당 활동을 한 일기들
    const withAct = state.entries.filter(e => e.activities.includes(act));
    // 해당 활동을 안 한 일기들
    const withoutAct = state.entries.filter(e => !e.activities.includes(act));
    
    const avgWith = withAct.length > 0 ? (withAct.reduce((sum, e) => sum + e.mood, 0) / withAct.length) : 0;
    const avgWithout = withoutAct.length > 0 ? (withoutAct.reduce((sum, e) => sum + e.mood, 0) / withoutAct.length) : 0;
    
    return {
      activity: act,
      avgWith: parseFloat(avgWith.toFixed(1)),
      avgWithout: parseFloat(avgWithout.toFixed(1)),
      count: withAct.length
    };
  }).filter(item => item.count > 0); // 한 번이라도 기록된 활동만 차트에 매핑
  
  const corrCtx = document.getElementById('correlationChart').getContext('2d');
  if (correlationChartInstance) correlationChartInstance.destroy();
  
  correlationChartInstance = new Chart(corrCtx, {
    type: 'bar',
    data: {
      labels: correlationData.map(d => d.activity),
      datasets: [
        {
          label: '수행했을 때 기분',
          data: correlationData.map(d => d.avgWith),
          backgroundColor: '#B5EAD7',
          borderRadius: 6
        },
        {
          label: '안 했을 때 기분',
          data: correlationData.map(d => d.avgWithout),
          backgroundColor: '#FFB7B2',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          max: 5,
          ticks: { stepSize: 1 }
        }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 10 } }
        }
      }
    }
  });

  // --- 3. 인지 왜곡 유형 빈도 그래프 ---
  const distortionCounts = {};
  state.entries.forEach(e => {
    if (e.cbt_distortions) {
      e.cbt_distortions.forEach(d => {
        distortionCounts[d] = (distortionCounts[d] || 0) + 1;
      });
    }
  });
  
  const distLabels = Object.keys(distortionCounts);
  const distValues = Object.values(distortionCounts);
  
  const distCtx = document.getElementById('distortionChart').getContext('2d');
  if (distortionChartInstance) distortionChartInstance.destroy();
  
  if (distLabels.length === 0) {
    // 데이터 없음 안내 가상 차트 그리기
    distortionChartInstance = new Chart(distCtx, {
      type: 'doughnut',
      data: {
        labels: ['기록 없음'],
        datasets: [{
          data: [1],
          backgroundColor: ['#EBE7E0']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { enabled: false }
        }
      }
    });
  } else {
    // 실제 차트 생성
    const pastelColors = ['#FFB7B2', '#FFDAC1', '#E2F0CB', '#B5EAD7', '#C7CEEA', '#9B9ECE'];
    distortionChartInstance = new Chart(distCtx, {
      type: 'doughnut',
      data: {
        labels: distLabels,
        datasets: [{
          data: distValues,
          backgroundColor: pastelColors.slice(0, distLabels.length),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, font: { size: 10 } }
          }
        }
      }
    });
  }
}
