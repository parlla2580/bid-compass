import type { Metadata } from 'next';
import { DocPage, DocSection } from '@/components/doc-page';

export const metadata: Metadata = { title: '개인정보 수집·이용 안내' };

export default function PrivacyPage() {
  return (
    <DocPage title="개인정보 수집·이용 안내" updated="2026-11-08">
      <DocSection title="1. 수집 항목과 목적">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="border border-slate-200 p-2">항목</th>
              <th className="border border-slate-200 p-2">목적</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="border border-slate-200 p-2">이메일, 비밀번호</td><td className="border border-slate-200 p-2">회원 식별, 로그인, 비밀번호 재설정, 서비스 안내</td></tr>
            <tr><td className="border border-slate-200 p-2">사업자등록번호, 업체명</td><td className="border border-slate-200 p-2">회사 확인, 업종·소재지 자동 입력</td></tr>
            <tr><td className="border border-slate-200 p-2">업종, 소재지, 기업규모, 수행실적, 매칭 선호도</td><td className="border border-slate-200 p-2">참여 가능 판정, 공고 추천</td></tr>
            <tr><td className="border border-slate-200 p-2">저장한 공고</td><td className="border border-slate-200 p-2">관심 공고 보관, 마감 안내</td></tr>
          </tbody>
        </table>
        <p>대표자명은 가입 시 나라장터 공개 업체정보와 대조하는 데에만 쓰며 <b>저장하지 않습니다</b>.</p>
        <p>비밀번호는 암호화되어 저장되며 운영자도 알 수 없습니다.</p>
      </DocSection>
      <DocSection title="2. 보유 기간">
        <p>회원 탈퇴 시 지체 없이 삭제합니다. 다른 법령에서 보관을 요구하는 경우에는 해당 기간 동안 보관합니다.</p>
      </DocSection>
      <DocSection title="3. 처리 위탁">
        <p>서비스 운영을 위해 아래 업체에 처리를 맡깁니다.</p>
        <ul className="list-disc pl-5">
          <li>Supabase: 회원 계정·데이터 저장 (데이터베이스 위치: 서울 리전)</li>
          <li>Vercel: 웹사이트 호스팅</li>
        </ul>
        <p className="text-xs text-slate-500">위탁 업체의 서버 위치에 따라 국외 이전 고지가 필요한지 공개 전에 검토합니다.</p>
      </DocSection>
      <DocSection title="4. 동의를 거부할 권리">
        <p>개인정보 수집·이용에 동의하지 않을 수 있습니다. 다만 동의하지 않으면 회원가입과 회원 전용 기능(공고 상세, 저장, 알림)을 이용할 수 없습니다. 가입 없이도 공고 목록과 참여 가능 판정은 볼 수 있습니다.</p>
      </DocSection>
      <DocSection title="5. 문의">
        <p>개인정보 관련 문의처: 서비스 공개 전에 기재합니다.</p>
      </DocSection>
    </DocPage>
  );
}
