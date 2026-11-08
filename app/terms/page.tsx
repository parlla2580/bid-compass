import type { Metadata } from 'next';
import { DocPage, DocSection } from '@/components/doc-page';

export const metadata: Metadata = { title: '이용약관' };

export default function TermsPage() {
  return (
    <DocPage title="이용약관" updated="2026-11-08">
      <DocSection title="1. 목적">
        <p>이 약관은 입찰나침반(이하 &lsquo;서비스&rsquo;)의 이용 조건과 절차, 이용자와 운영자의 권리·의무를 정합니다.</p>
      </DocSection>
      <DocSection title="2. 서비스 내용">
        <p>서비스는 조달청 나라장터 공공데이터를 바탕으로 입찰공고를 모아 보여주고, 이용자가 입력한 업종·소재지와 공고 조건을 비교한 참여 가능 판정, 공고 해설, 적격심사 계산 도구 등을 무료로 제공합니다.</p>
      </DocSection>
      <DocSection title="3. 정보의 정확성">
        <p>참여 가능 판정과 계산 결과는 공공데이터와 이용자가 입력한 정보를 비교한 <b>참고 정보</b>입니다. 입찰 참가자격과 금액의 최종 판단은 반드시 나라장터 공고문 원문과 적격심사 세부기준으로 확인해야 합니다.</p>
        <p>공공데이터의 누락·지연·오류, 또는 이용자가 잘못 입력한 정보로 생긴 결과에 대해 운영자는 책임을 지지 않습니다.</p>
      </DocSection>
      <DocSection title="4. 회원가입과 계정">
        <p>회원가입에는 이메일, 비밀번호, 사업자등록번호, 대표자명(회사 확인 용도)이 필요합니다. 이용자는 본인이 소속된 사업자의 정보만 입력해야 하며, 타인의 사업자 정보를 도용해서는 안 됩니다.</p>
        <p>계정과 비밀번호 관리 책임은 이용자에게 있습니다.</p>
      </DocSection>
      <DocSection title="5. 금지 행위">
        <p>서비스의 정상 운영을 방해하는 행위, 자동화된 수단으로 대량 수집하는 행위, 타인의 정보를 도용하는 행위를 금지합니다.</p>
      </DocSection>
      <DocSection title="6. 서비스 변경·중단">
        <p>운영자는 공공데이터 제공 중단, 시스템 점검 등의 사유로 서비스의 전부 또는 일부를 변경·중단할 수 있으며, 가능한 경우 미리 안내합니다.</p>
      </DocSection>
      <DocSection title="7. 탈퇴">
        <p>이용자는 언제든 탈퇴를 요청할 수 있으며, 운영자는 개인정보처리방침에 따라 회원 정보를 삭제합니다.</p>
      </DocSection>
    </DocPage>
  );
}
