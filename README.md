# 입찰나침반 — 클릭커블 프로토타입

`login.html`을 브라우저로 열면 시작됩니다. 빌드 과정이 없고, 인터넷 연결이 필요합니다(Tailwind·Lucide·Pretendard CDN).

| 파일 | 화면 |
|---|---|
| login.html | 로그인 |
| signup.html | 회원가입 (2단계) |
| index.html | 대시보드/홈 |
| bid-list.html | 공고 리스트 (검색·필터·정렬) |
| bid-detail.html?id=1~10 | 공고 상세 |
| recommend.html | 맞춤 추천 공고 |
| calculator.html?tab=price\|score | 적격심사 도구 |
| mypage.html | 마이페이지 |

- 공통: `assets/common.js`(더미 데이터 · 헤더 · 하단 탭 · 카드 · 토스트 · 바텀시트), `assets/style.css`, `assets/tw-config.js`
- 저장한 공고, 매칭 설정, 정보 수정 값은 브라우저 localStorage에 저장됩니다(초기화: 개발자도구 > Application > Local Storage 삭제).
- 계산기의 비율 값(예정가격 ±10%, 복수예비가격 범위, 낙찰하한율, 배점, 기준점 85점)은 화면 확인용 가정값입니다. `calculator.html`의 `RULES`, `SLIDERS`, `BONUS`, `PASS` 상수에서 바꿀 수 있습니다.
