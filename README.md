# 입찰나침반

공공조달 입찰정보를 무료로 찾아보는 서비스입니다. 현재는 더미 데이터로 동작하는 1단계(Next.js 전환) 상태입니다.

## 실행

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # 운영 빌드 확인
```

## 화면

| 경로 | 화면 |
|---|---|
| `/login` | 로그인 |
| `/signup` | 회원가입 (2단계) |
| `/` | 대시보드/홈 |
| `/bids` | 공고 리스트 (검색·필터·정렬) |
| `/bids/[id]` | 공고 상세 |
| `/recommend` | 맞춤 추천 공고 |
| `/calculator` | 적격심사 도구 (`?tab=score`로 점수 계산기) |
| `/mypage` | 마이페이지 |

## 구조

- `lib/data.ts` — 더미 공고·회사 데이터 (2단계에서 나라장터 API로 교체)
- `lib/store.ts` — 저장 공고·매칭 설정 (브라우저 저장, 3단계에서 Supabase로 교체)
- `app/calculator/rules.ts` — 계산기 가정값 (4단계에서 실제 기준으로 검증)
- `prototype/` — 최초 HTML 프로토타입 (참고용)

## 진행 단계

1. Next.js 전환 — 완료
2. 나라장터 API로 실제 공고 연동
3. Supabase로 회원가입·로그인·저장 공고
4. 매칭 로직, 적격심사 기준 검증
