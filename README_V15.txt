Crypto Analyzer V15.6 - Vercel + Supabase + Web Push
===================================================

V15 핵심
--------
V14 전체 기능을 유지하면서 서버형 자동 알림을 추가했습니다.

휴대폰/PWA -> Push 구독 -> Vercel API -> Supabase DB -> Vercel Cron -> Upbit 분석 -> 조건 충족 -> Web Push

서버 DB에 저장되는 내용
- 랜덤 Device ID
- Push subscription endpoint / 암호화 공개정보
- 사용자가 저장한 알림 조건
- 실제 조건 발동 Signal Event 기록

V15 신규 파일
------------
sw.js
supabase_schema.sql
ENV_TEMPLATE.txt
lib/db.js
lib/signal.js
lib/monitor.js
api/push-public-key.js
api/push-subscribe.js
api/push-test.js
api/cloud-alerts.js
api/check-alerts.js
api/cron-monitor.js
api/signal-events.js

1. Supabase 설정
---------------
1) Supabase 프로젝트 생성
2) SQL Editor에서 supabase_schema.sql 전체 실행
3) Project URL과 service_role key 확인

service_role key는 GitHub/index.html에 넣지 말고 Vercel Environment Variables에만 저장하세요.

2. Vercel Environment Variables
-------------------------------
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
CRON_SECRET
기존 AI 사용 시 OPENAI_API_KEY

이번 대화에서 생성된 V15_PRIVATE_ENV_VALUES_DO_NOT_UPLOAD.txt 파일의 VAPID Key와 CRON_SECRET을 사용할 수 있습니다. 이 파일은 GitHub에 업로드하지 마세요.

3. Redeploy 후 확인
------------------
https://내프로젝트.vercel.app/api/health

정상 예
{
  "status":"ok",
  "app":"Crypto Analyzer V15.6",
  "aiConfigured":true,
  "dbConfigured":true,
  "pushConfigured":true,
  "cronConfigured":true
}

4. 휴대폰 사용 순서
------------------
1) V15 사이트 접속 -> My 탭
2) ① 서버 Push 등록 -> 알림 권한 허용
3) 알림 조건 입력
4) ② 서버 알림조건 저장
5) ③ 테스트 Push
6) ④ 서버 조건 지금 검사

권장 예시: KRW-BTC / 4시간 / Score >= +5 / Quality >= 75 / ADX >= 25 / Cooldown 4시간

Cron 중요
---------
기본 vercel.json은 Vercel Hobby에서도 배포되도록 하루 1회로 설정합니다.
0 0 * * * = 매일 00:00 UTC = 한국시간 오전 9시 시간대. Hobby는 실행시각이 해당 시간 내에서 지연될 수 있습니다.

Vercel Pro에서 4시간마다: 0 */4 * * *
매시간: 0 * * * *
Hobby에서 하루 1회보다 잦은 Cron 표현은 배포 오류가 날 수 있습니다.

보안
----
CRON_SECRET가 있으면 Vercel Cron이 Authorization Bearer 값으로 전달하고 cron-monitor가 검증합니다.
SUPABASE_SERVICE_ROLE_KEY는 Vercel 서버에서만 사용합니다.
Push는 Service Worker(sw.js)가 받습니다.

주의
----
V15는 자동 주문 프로그램이 아니며 거래소 개인 API Key를 사용하지 않습니다.
Signal Quality는 성공확률이 아닙니다. 서버 알림은 투자 권유가 아닙니다.


V15.1 UI 변경
-------------
화면 위계를 다시 설계했습니다.

1순위: 메인 가격 차트
- 데스크톱에서 화면 폭의 약 70% 이상
- 모바일에서도 첫 화면의 중심으로 크게 표시

2순위: 핵심 판단
- Score
- Signal Quality
- Historical Win
- 시장 국면 / ADX
- 지지 / 저항

3순위: 핵심 보조지표
- RSI
- ADX
- 거래량비
- ATR
중간 크기의 4개 카드로 표시

4순위: 세부 데이터
- RSI/MACD/거래량 보조 차트
- Score History
- Score 변화 원인
기본적으로 접힌 상태로 두어 화면 밀도를 낮춤

판정 근거
- 처음에는 핵심 조건만 표시
- "세부 근거 더보기"로 전체 표시

서버 알림 / Scanner / AI / Backtest / My 기능은 기존 V15 기능을 유지합니다.


V15.2 승인 UI 반영
------------------
이번 버전은 대화에서 이미지화한 UI 구조에 맞춰 실제 index.html을 재배치했습니다.

화면 위계
1. 상단 4개 핵심 카드
   - 현재가
   - Score + 멀티TF 미니 Score
   - Signal Quality + Historical Win
   - 시장 국면 + ADX

2. 메인 가격 차트
   - 화면 폭을 거의 전체 사용
   - MA20/60/120, Bollinger, Support/Resistance
   - 모바일에서도 큰 높이 유지

3. 중간 크기 핵심지표 4개
   - RSI
   - ADX
   - 거래량비
   - ATR
   - 각 카드 안에 미니 추세 그래프

4. 기본 접힘 세부정보
   - 보조 지표 차트
   - Score History
   - Score 변화 원인 / 판정근거

5. 핵심 판단 3열
   - 주요 지지/저항
   - 기술적 핵심 요약
   - ATR Risk Plan

6. 하단 요약
   - 멀티 타임프레임
   - 기본 백테스트 자동 요약
   - Scanner 최근 상위 결과

7. 하단 유틸리티
   - 서버 자동 알림 상태
   - Watchlist
   - Portfolio 요약

서버 DB / Cron / Web Push / Supabase / Scanner / AI / Journal / Portfolio 기능은 V15.1과 동일하게 유지됩니다.


V15.3 차트 가독성 조정
----------------------
- 데스크톱 메인 차트 높이: 약 370~410px
- 모바일 메인 차트 높이: 약 295~320px
- 첫 화면에서 RSI/ADX/Volume/ATR 카드까지 함께 보이도록 세로 길이 축소
- 메인 차트 표시 구간을 최대 200봉 → 150봉으로 조정하여 캔들 식별성 개선
- 서버 DB / Cron / Push / Scanner / AI 기능은 V15.2와 동일


V15.4 모바일 전용 레이아웃
--------------------------
760px 이하에서는 단순 축소가 아니라 별도 모바일 레이아웃으로 동작합니다.

- 상단 핵심정보: 2 x 2 카드
- 탭: 압축형 그리드 대신 좌우 스와이프
- 메인 차트:
  · 모바일 기본 최대 72봉
  · 태블릿 최대 110봉
  · 데스크톱 최대 150봉
  · 모바일 높이 약 282~300px
- RSI / ADX / Volume / ATR: 2 x 2 유지
- 세부 지표 / Score History / 변화원인: 세로형 접기
- 지지/저항 / 기술요약 / Risk Plan: 모바일 1열
- Backtest / Scanner / My 표: 최소 폭 보존 + 좌우 스와이프
- 서버 Push 설정 폼: 모바일 1~2열
- 하단 고정 메뉴:
  · 현재분석
  · Scanner
  · AI
  · My
- 모바일 최초 candle API count는 120으로 낮춰 초기 표시 부담을 줄임

데스크톱 레이아웃과 서버 DB / Cron / Web Push / Scanner / AI 기능은 유지됩니다.


V15.5 Signal Lab
================

1. 확정봉 신호 모드
-------------------
기본값은 "확정봉 · 권장"입니다.
진행 중인 현재 봉은 계산에서 제외하므로 봉 중간 Score 변화에 의한 신호 흔들림을 줄입니다.

"진행봉 Preview"를 선택하면 현재 미완성 봉까지 포함해 볼 수 있습니다.
Preview는 확정 신호가 아닙니다.

Vercel 서버 알림 계산도 V15.5부터 확정봉을 기본으로 사용합니다.

2. Signal Marker + Replay
-------------------------
메인 차트에서 |Score| >= 5 신호를 ▲ / ▼ 마커로 표시합니다.

마커 클릭/터치 시 당시:
- Score
- 단일TF Replay Quality
- 시장 국면
- RSI / ADX
- 6봉 후 수익률
- MFE (최대 유리 움직임)
- MAE (최대 불리 움직임)

을 바로 확인할 수 있습니다.

3. Scanner Relative Strength + Breadth
--------------------------------------
Scanner는 이제:
- BTC 대비 12봉 상대강도(RS)
- 스캔 시장 중 MA20 위 종목 비율
- Positive Score 비율
- 강한 상승 국면 비율
- 24H 상승 종목 비율

을 계산합니다.

서버 Scanner 최대 검색 종목 수도 UI와 맞춰 50개로 조정했습니다.

4. Signal Outcome DB
--------------------
서버 알림으로 발생한 Signal Event는 6봉이 지난 뒤:
- 6봉 수익률
- MFE
- MAE
- 방향 적중 여부

를 Supabase signal_events에 자동 누적할 수 있습니다.

기존 Supabase 사용자 중요:
supabase_v15_5_migration.sql 파일을 Supabase SQL Editor에서 한 번 실행해야 합니다.

My -> 최근 서버 Signal Events -> "Outcome 업데이트" 버튼으로 수동 평가도 가능합니다.
Vercel Cron 실행 시에도 과거 미평가 Signal Event의 Outcome 평가를 시도합니다.

5. 기존 기능
-----------
V15.4의:
- 모바일 전용 레이아웃
- 서버 DB
- Cron
- Web Push
- Backtest
- Walk-Forward
- Risk Plan
- Scanner
- AI
- Watchlist / Journal / Portfolio

기능은 유지됩니다.

주의
----
Signal Quality / Replay Quality / Historical Win Rate / Outcome 통계는 미래 성과를 보장하지 않습니다.
V15.5는 신호 검증 및 연구 도구이며 자동 주문 프로그램이 아닙니다.


V15.5.1 Scanner Hotfix
======================

Scanner 안정성 수정:
- 최대 스캔 종목 50 -> 30
- Upbit candle API 요청 속도를 약 6.7 req/s 이하로 제한
- HTTP 429 / 418 / 5xx 재시도
- 개별 종목 실패 시 Scanner 전체 실패 대신 부분 결과 반환
- BTC benchmark는 기존 스캔 결과를 재사용하여 API 호출 1회 절감
- Vercel api/scanner.js maxDuration 60초 지정
- API 응답에 calculated / failed / failures 디버그 정보 추가

직접 API 진단:
https://YOUR_DOMAIN/api/scanner?tf=240&n=10&minScore=0&minVol=0

정상 응답에는:
"ok": true
"scanned": 10
"calculated": 숫자
"failed": 숫자
"breadth": {...}
"results": [...]
가 표시됩니다.


V15.5.2 Scanner Compatibility Hotfix
====================================

수정 오류:
Cannot read properties of undefined (reading 'toFixed')

원인:
Scanner API의 일부 필드가 구버전 응답이거나 개별 계산 실패로 비어 있을 때
브라우저가 undefined.toFixed()를 호출해 Scanner 화면 전체가 중단될 수 있었습니다.

수정:
- quality가 없으면 confidence 호환
- vol이 없으면 volRatio 호환
- relativeStrength가 없으면 "-" 표시
- RSI / ADX / 24H change / Breadth 값이 비어 있어도 "-" 표시
- 어떤 숫자 필드가 누락되어도 Scanner 테이블 전체가 중단되지 않음
- Scanner UI 최대 30종목으로 서버 안정모드와 일치
- API 에러의 detail 메시지를 화면에 표시

중요:
GitHub에서 최소 아래 3개는 함께 교체하세요.
1. index.html
2. api/scanner.js
3. vercel.json

이렇게 하면 브라우저 UI와 서버 Scanner 버전 불일치도 함께 제거됩니다.


V15.6 한글 UI + 다이버전스 + 시장환경
=====================================

UI
--
사용자 화면의 영어 표현을 한글 중심으로 정리했습니다.
짧은 UI 약어:
- 신품 = 신호 품질
- 적중률 = 과거 유사신호 적중률
- 상강 = 상대 강도
- 다중TF = 다중 시간봉
RSI / MACD / ADX / ATR / MFE / MAE처럼 국제적으로 통용되는 지표 약어는 유지합니다.

다이버전스
----------
확정된 좌 3봉 + 우 3봉 피벗을 사용합니다.
RSI와 MACD를 각각 검사합니다.

- 일반 상승 다이버전스: 가격 저점 하락 + 오실레이터 저점 상승
- 일반 하락 다이버전스: 가격 고점 상승 + 오실레이터 고점 하락
- 히든 상승 다이버전스: 가격 저점 상승 + 오실레이터 저점 하락
- 히든 하락 다이버전스: 가격 고점 하락 + 오실레이터 고점 상승

1시간 / 4시간 / 일봉을 동시에 표시하며,
RSI와 MACD 동시 확인, 최근성, 히든 신호의 추세 일치 여부로 1~5단계 강도를 표시합니다.
다이버전스는 기존 Score 계산에 합산하지 않습니다.

시장환경
--------
새 API: /api/market-env

CoinPaprika 무료 공개 데이터:
- BTC 도미넌스
- USDT 도미넌스
- 전체 암호화폐 시가총액 24시간 변화
- BTC / USDT 시가총액 변화

FRED 공개 CSV:
- VIX
- 미국 10년 국채금리
- 광의 달러지수
- RRP / TGA / 지급준비금 데이터(서버 응답에 포함)

UI 종합 판정:
- 비트코인 우위
- 알트코인 우호
- 시장 전체 위험선호
- 위험회피 환경
- 혼조

USDT 도미넌스는 위험선호/위험회피의 보조지표이지 인과관계를 의미하지 않습니다.
스캐너를 실행하면 MA20 위 종목 비율과 양(+) 점수 비율도 시장환경 판정에 추가됩니다.

기존 V15.5.2 기능
----------------
모바일 전용 UI, 확정봉 모드, 신호재현, Outcome/MFE/MAE,
서버 DB, Cron, Web Push, 백테스트, 위험관리, 종목스캐너,
AI, 관심종목, 매매기록, 보유자산 기능을 유지합니다.


V15.7 사용자 중심 최적화
========================

기본 메뉴
---------
- 지금 분석
- 과거 성과
- 시간대별 비교
- 종목 찾기
- AI 해설
- 알림·설정

화면 구조
---------
- 별도 위험관리 화면 제거: 필요한 계산은 '지금 분석 > 투자금액 계산'에 흡수
- 별도 자동검증 화면 제거: '과거 성과 > 조건별로 더 확인하기'에 흡수
- 매매기록/보유자산/분석기록은 기본 UI에서 숨김
- 개발자식 명칭 대신 사용자가 바로 뜻을 알 수 있는 한글 표현을 우선
- RSI/MACD/ADX/ATR/MFE/MAE 등 표준 지표 약어는 유지

자동 알림
---------
- 유료 Vercel Pro를 전제로 하지 않음
- `.github/workflows/crypto-monitor.yml` 동봉
- GitHub Actions에서 APP_URL 변수 + CRON_SECRET 비밀값을 설정하면
  `/api/cron-monitor`를 외부 스케줄러처럼 호출 가능
- 자세한 설정은 `.github/FREE_ALERT_SETUP.md` 참고
- GitHub Actions의 무료 사용 가능량은 계정/저장소 정책에 따라 달라질 수 있음

배포 확인
---------
- `/api/version` 호출 시 15.7.0 반환
- 과거 Scanner 배포/캐시 혼선을 확인할 때 버전 확인용으로 사용

주의
----
다이버전스, 시장 전체 흐름, 품질, 과거 적중률은 모두 보조 판단입니다.
품질은 성공확률이 아닙니다.


V15.8 첨부자료 기반 보조판단 업데이트
====================================

- 신호 겹침: 기술 점수 / 시간대 흐름 / 다이버전스 / 일목 흐름 / 돌파·거래량 / 시장 전체 흐름을 서로 분리해 확인
- 일목 흐름: 9/26/52 구조, 가격의 구름 위치, 전환선/기준선, 앞 구름, 후행 확인, 52기간 갱신, 선행선 반대 움직임
- 돌파·재확인: 확정 피벗 지지/저항, 최근 돌파/이탈, 재확인, 당시 거래량
- 반전 후보: 최근 10봉 과매도/과매수 + MACD 교차
- 무효화 가격: 사용자가 손절 무효화 가격을 직접 지정해 허용손실 기준 투자금액 계산
- 엘리어트 후보: 자동 카운팅 확정 대신 2파/3파/4파 기본 규칙만 검증
- 기존 Score 산식에는 새 보조지표를 합산하지 않음
- 첨부자료의 '무조건', 특정 승률 등 경험적 주장은 프로그램 확률이나 점수로 사용하지 않음

서버 준비
---------
lib/signal.js에 반전 후보와 간단한 일목 방향을 추가했습니다.
기존 자동 알림 규칙/DB 구조는 유지하므로 새 Supabase 마이그레이션은 필요 없습니다.
현재 자동 알림의 발동 조건은 기존 점수/품질/ADX/거래량/시장 흐름 규칙을 그대로 사용합니다.


V15.8.1 모바일 UI 최적화
========================

기본 원칙
---------
- 모바일 우선(Mobile-first)
- 360 / 390 / 412 px 화면 폭을 기준으로 가로 잘림 방지
- 새 기능을 추가할 때 모바일 레이아웃 검증을 완료 조건에 포함

주요 변경
---------
- 모바일 상단을 현재가 / 점수 / 신호 겹침 / 시장 판단 4개 핵심 카드로 재구성
- 차트 바로 아래 '핵심 신호' 추가
  - 다이버전스
  - 일목
  - 돌파
  - 반전
  - 파동 후보
- 다이버전스 표는 모바일에서 카드형으로 표시
- 상세 분석은 모바일에서 기본 접힘
- 데스크톱에서는 기존 상세 화면 유지
- 긴 텍스트, 카드, 캔버스, 폼의 화면 밖 넘침 방지 강화
- V15.8.1 / 모바일 UI 개선 배지를 헤더에 표시

기술 계산
---------
- V15.8의 점수·다이버전스·일목·돌파·반전·파동 계산식은 변경하지 않음
- 이번 버전은 UI/반응형 최적화가 핵심
