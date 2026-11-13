-- =========================================================
-- 018: 공고 목록 스냅샷용 공개 저장소(버킷)
--  · 수집기가 3시간마다 마감 전 공고 전체를 압축 파일(open-notices.json.gz)로 만들어 여기에 올림
--  · 화면은 DB 대신 이 파일을 CDN에서 받음 → 첫 방문이 빨라지고 DB 부담이 줄어듦
--  · 공개 버킷: 누구나 읽기만 가능(공고는 원래 공개 데이터). 쓰기는 관리자 키(수집기)만
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

insert into storage.buckets (id, name, public)
values ('public-data', 'public-data', true)
on conflict (id) do update set public = true;

-- 확인: public 이 true 여야 정상
select id, public from storage.buckets where id = 'public-data';
