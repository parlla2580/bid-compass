# 입찰나침반 작업 규칙

## 소통
- 사용자에게는 **항상 한국어로만** 답한다. 영어 문장으로 답하지 않는다.
- 근거가 없거나 불확실하면 추측하지 말고 "확실하지 않습니다"라고 밝히고, 출처가 있으면 함께 적는다.

## 사용자에게 작업을 부탁할 때
- **SQL 실행을 부탁할 때는 반드시 아래 두 주소를 함께 준다.**
  - 파일: `https://github.com/parlla2580/bid-compass/blob/main/supabase/migrations/<파일명>`
  - 실행 화면: https://supabase.com/dashboard/project/tpuhqzxhrwuugojsnfpj/sql/new
- 수집 재실행을 부탁할 때: https://github.com/parlla2580/bid-compass/actions/workflows/collect.yml (Run workflow, 구간 시간 입력)
- 그 밖의 설정 화면도 가능한 한 바로 열리는 주소를 준다.

## 프로젝트 정보
- 기획서: 노션 「입찰나침반 서비스 기획서 v2.2」 (최신 확정 사항은 12장)
- 배포: https://bid-compass-gamma.vercel.app (main 브랜치 자동 배포)
- Supabase 프로젝트: ipchal_1 (`tpuhqzxhrwuugojsnfpj`)
- 수집: GitHub Actions `.github/workflows/collect.yml` — 3시간마다, 결과는 `collect_runs` 테이블
- DB 변경은 `supabase/migrations/` 에 번호 순서로 추가하고, 여러 번 실행해도 안전하게 작성한다
- 비밀값: `NARA_API_KEY`, `SUPABASE_SECRET_KEY` 는 GitHub Secrets / `NARA_API_KEY` 는 Vercel 환경변수에도. 코드·대화에 값을 쓰지 않는다
- 공공데이터포털 개발계정 한도(서비스별 약 1,000회/일)를 넘지 않게 호출량을 관리한다
