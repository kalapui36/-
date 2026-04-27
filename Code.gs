/* Code.gs */
const MASTER_PW = "4021"; 

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('2026 상담 관리 플랫폼')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function initPlatform() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabs = [
    { name: '대시보드', header: ['현재 생성된 학급 코드', '상담 설정 유무', '현재 신청 인원', '최근 업데이트'] },
    { name: '마스터설정', header: ['학급코드', '상담시간', '쉬는시간', '날짜', '시작', '종료'] },
    { name: '통합신청', header: ['학급코드', '신청시간', '학생이름', '방식', '선택시간들'] },
    { name: '통합배정', header: ['학급코드', '시간', '학생이름', '방식'] }
  ];
  tabs.forEach(t => {
    let s = ss.getSheetByName(t.name) || ss.insertSheet(t.name);
    s.clear().appendRow(t.header).getRange("1:1").setBackground("#0035ad").setFontColor("white").setFontWeight("bold");
  });
  updateDashboard();
  return "✅ 플랫폼 초기화 완료";
}

function updateDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dash = ss.getSheetByName('대시보드');
  if(!dash) return;
  const setRows = ss.getSheetByName('마스터설정').getDataRange().getValues().slice(1);
  const appRows = ss.getSheetByName('통합신청').getDataRange().getValues().slice(1);
  
  let classes = [...new Set([...setRows.map(r=>r[0]), ...appRows.map(r=>r[0])])].filter(String);
  let result = [];
  classes.forEach(c => {
    let hasSetting = setRows.some(r => r[0] == c) ? "O" : "X";
    let count = appRows.filter(r => r[0] == c).length;
    result.push([c, hasSetting, count + "명", new Date()]);
  });

  if (dash.getLastRow() > 1) dash.getRange(2, 1, dash.getLastRow() - 1, 4).clearContent();
  if (result.length > 0) dash.getRange(2, 1, result.length, 4).setValues(result);
}

function parseTimeStr(val) {
  if (!val) return "00:00";
  if (val instanceof Date) return Utilities.formatDate(val, "GMT+9", "HH:mm");
  return String(val).replace(/'/g, "").trim();
}

function getClassAdminData(classCode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setRows = ss.getSheetByName('마스터설정').getDataRange().getValues();
  const appRows = ss.getSheetByName('통합신청').getDataRange().getValues();
  
  const mySet = setRows.filter(r => r[0] == classCode);
  const myApp = appRows.filter(r => r[0] == classCode).map(r => ({
    time: Utilities.formatDate(new Date(r[1]), "GMT+9", "MM/dd HH:mm"),
    name: r[2], type: r[3], choices: r[4]
  }));

  return {
    exists: mySet.length > 0,
    config: mySet.length > 0 ? {
      duration: mySet[0][1], breakTime: mySet[0][2],
      dates: mySet.map(r => ({
        date: Utilities.formatDate(new Date(r[3]), "GMT+9", "yyyy-MM-dd"),
        start: parseTimeStr(r[4]), end: parseTimeStr(r[5])
      }))
    } : null,
    apps: myApp
  };
}

function getClassSlots(classCode) {
  const rows = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('마스터설정').getDataRange().getValues();
  const myRows = rows.filter(r => r[0] == classCode);
  if (myRows.length === 0) return null;

  const dur = parseInt(myRows[0][1]);
  const brk = parseInt(myRows[0][2]);
  const total = dur + brk;
  let all = [];

  myRows.forEach(row => {
    let d = new Date(row[3]);
    let dateStr = Utilities.formatDate(d, "GMT+9", "yyyy년 MM월 dd일");
    let slots = [];
    
    let sTime = parseTimeStr(row[4]);
    let eTime = parseTimeStr(row[5]);
    
    let [sH, sM] = sTime.split(':').map(Number);
    let [eH, eM] = eTime.split(':').map(Number);
    
    let startMins = (sH * 60) + (sM || 0);
    let endMins = (eH * 60) + (eM || 0);

    while (startMins + dur <= endMins) {
      let h1 = Math.floor(startMins / 60).toString().padStart(2, '0');
      let m1 = (startMins % 60).toString().padStart(2, '0');
      
      let endSlotMins = startMins + dur;
      let h2 = Math.floor(endSlotMins / 60).toString().padStart(2, '0');
      let m2 = (endSlotMins % 60).toString().padStart(2, '0');

      slots.push(`${h1}:${m1}~${h2}:${m2}`);
      startMins += total;
    }
    all.push({ date: dateStr, slots: slots });
  });
  return all;
}

function checkUserStatus(classCode, name) {
  const data = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('통합신청').getDataRange().getValues();
  const existing = data.find(r => r[0] == classCode && r[2] == name);
  if(existing) return { exists: true, type: existing[3], choices: String(existing[4]).split(', ') };
  return { exists: false };
}

function submitApp(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('통합신청');
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] == data.classCode && rows[i][2] == data.name) sheet.deleteRow(i + 1);
  }
  sheet.appendRow([data.classCode, new Date(), data.name, data.type, data.choices.join(', ')]);
  updateDashboard();
  return "✅ 상담 신청이 정상적으로 처리되었습니다.";
}

function verifyAdmin(pw) { return pw === MASTER_PW; }

function saveClassConfig(config) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('마스터설정');
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) { if (data[i][0] == config.classCode) sheet.deleteRow(i + 1); }
  config.dates.forEach(d => {
    sheet.appendRow([config.classCode, config.duration, config.breakTime, d.date, "'" + d.start, "'" + d.end]);
  });
  updateDashboard();
  
  return "✅ 설정이 완벽하게 저장되었습니다.\n\n" +
         "📌 [선생님 안내]\n" +
         "이후에 다시 관리자 비밀번호를 치고 들어오시면\n" +
         "1. 학부모 신청 현황 실시간 확인\n" +
         "2. 상담 일정 및 시간 수정\n" +
         "3. 자동 배정(시간표 생성) 실행\n" +
         "위 화면이 즉시 나타납니다. 편하게 관리하세요!";
}

function runClassAssign(classCode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const raw = ss.getSheetByName('통합신청').getDataRange().getValues();
  const apps = raw.filter(r => r[0] == classCode).map(r => ({ name: r[2], type: r[3], choices: String(r[4]).split(', ') }));
  
  if (apps.length === 0) return { error: "⚠️ 신청 데이터가 없습니다." };
  
  apps.sort((a, b) => a.choices.length - b.choices.length);
  let sch = {}, res = [], conflicts = [];
  
  apps.forEach(app => {
    let assigned = false;
    for (let t of app.choices) { 
      if (!sch[t]) { 
        sch[t] = app.name; 
        res.push({ time: t, name: app.name, type: app.type }); 
        assigned = true; 
        break; 
      } 
    }
    if (!assigned) conflicts.push({ name: app.name, type: app.type, choices: app.choices.join(', ') });
  });

  const resSheet = ss.getSheetByName('통합배정');
  const allRes = resSheet.getDataRange().getValues();
  for (let i = allRes.length - 1; i >= 1; i--) { if (allRes[i][0] == classCode) resSheet.deleteRow(i + 1); }
  
  res.sort((a, b) => a.time.localeCompare(b.time)).forEach(r => resSheet.appendRow([classCode, r.time, r.name, r.type]));
  return { success: true, assigned: res, conflicts: conflicts };
}

// 선생님이 요청하신 개별 신청 내역 삭제 기능
function deleteApplication(classCode, name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('통합신청');
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] == classCode && data[i][2] == name) {
      sheet.deleteRow(i + 1);
    }
  }
  updateDashboard();
  return `✅ ${name} 학생의 신청 내역이 삭제되었습니다.`;
}
