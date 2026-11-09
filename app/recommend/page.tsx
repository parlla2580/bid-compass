import { redirect } from 'next/navigation';

/** 추천 공고는 공고 탭의 '맞춤 공고'로 합쳐짐 (v3.1) */
export default function RecommendPage() {
  redirect('/bids');
}
