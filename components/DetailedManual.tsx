'use client';

// 전체 사용 설명서 — "더 자세한 사용법이 궁금해요"로 열리는 긴 글 가이드.
//
// OnboardingGuide(그림 캐러셀)는 "처음 흐름만 빠르게", 이 설명서는 "각 부분 자세히".
// 내용은 항상 현재 앱 기준으로 정확하게 적는다(없어진 기능 설명 금지 — 예전 도움말의 실수 반복 X).

import { useEffect } from 'react';

// 한 묶음 섹션 — 소제목 + 내용.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 22 }}>
      <h3
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--ink)',
          margin: '0 0 8px',
          paddingBottom: 6,
          borderBottom: '1px solid var(--rule)',
        }}
      >
        {title}
      </h3>
      <div style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--ink-2)', wordBreak: 'keep-all' }}>
        {children}
      </div>
    </section>
  );
}

// 목록 — 군더더기 없는 ul.
function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
      {items.map((it, i) => (
        <li key={i} style={{ marginBottom: 5 }}>
          {it}
        </li>
      ))}
    </ul>
  );
}

export default function DetailedManual({ onClose }: { onClose: () => void }) {
  // ESC로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="콘티노트 사용 설명서"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(31, 27, 22, 0.6)',
        zIndex: 210, // OnboardingGuide(200)보다 위에 겹친다
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--paper)',
          width: '100%',
          maxWidth: 640,
          maxHeight: '88vh',
          overflowY: 'auto',
          borderRadius: 14,
          padding: '28px 28px 24px',
          position: 'relative',
          border: '1px solid var(--rule)',
          boxShadow: '0 24px 70px -12px rgba(0,0,0,0.4)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="닫기"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '1px solid var(--rule)',
            background: 'var(--paper)',
            color: 'var(--ink-2)',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          ✕
        </button>

        <h2 style={{ fontSize: 22, margin: '0 0 4px', wordBreak: 'keep-all' }}>콘티노트 사용 설명서</h2>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: 0 }}>
          찬양 악보를 예배용 PPT로 — 처음 쓰는 분도 따라 할 수 있게 정리했어요.
        </p>

        <Section title="콘티노트는 이렇게 움직여요">
          악보 사진을 올리면 → AI가 가사를 뽑고 → <b>슬라이드 스튜디오</b>에서 내용과 배경을 함께
          꾸며 → 예배용 PPT로 내려받아요. 화면은 위에서 아래로 <b>1 · 2 · 3</b> 순서예요.
          (휴대폰에서는 한 단계씩 넘기며 진행해요.)
        </Section>

        <Section title="1단계 · 악보 올리기">
          <List
            items={[
              <>악보를 <b>사진(JPG·PNG)이나 PDF</b>로 올려요. 한 번에 <b>12장</b>까지 가능해요.</>,
              <>화면에 끌어다 놓거나 ‘파일 선택’으로 올려요.</>,
              <><b>정확도 우선</b> — 흐릿하거나 글씨가 작은 악보일 때만 켜요. 더 신중히 읽는 대신 조금 느려요.</>,
              <><b>가사 추출하기</b>를 누르면 시작돼요. (단축키: Ctrl/⌘ + Enter)</>,
            ]}
          />
        </Section>

        <Section title="2단계 · 가사 확인하고 다듬기">
          <List
            items={[
              <>AI가 뽑은 가사가 <b>곡 카드</b>로 나와요.</>,
              <>가사는 <b>묶음(칩)</b>으로 나뉘어요. 칩을 누르면 3단계 콘티에 그 가사가 들어가요.</>,
              <><b>후렴처럼 반복되는 묶음은 여러 번 누르면</b> 그만큼 들어가요. (후렴 4번이면 4번 클릭)</>,
              <>틀린 글자는 묶음의 <b>✎</b>로 직접 고쳐요. AI가 고친 내용을 다음 추출 때 참고해요.</>,
              <>묶음을 다시 나누려면 <b>다시 나누기</b> — <b>빈 줄(엔터 두 번)</b>로 끊으면 그 자리에서 묶음이 갈려요.</>,
              <><b>곡 제목</b>을 누르면 바로 고칠 수 있어요.</>,
              <><b>전체 오타 검토</b>로 의심되는 곳(빨간 점)을 표시해 볼 수 있어요. (PPT엔 영향 없어요.)</>,
            ]}
          />
        </Section>

        <Section title="3단계 · 슬라이드 스튜디오 (내용과 배경을 한 화면에서)">
          이제 가사 편집과 배경 고르기가 <b>한 화면</b>에서 같이 돼요. 가운데 큰 화면이 실제 슬라이드라,
          <b>배경 위에 바로 글자를 쓰고 지우며</b> 보이는 그대로 만들어요.
          <p style={{ margin: '10px 0 2px', fontWeight: 600, color: 'var(--ink)' }}>내용 채우기</p>
          <List
            items={[
              <>2단계에서 칩을 누르면 슬라이드가 쌓여요. 가운데 화면에서 직접 입력·수정해도 돼요.</>,
              <><b>가사 붙여넣기</b> — 이미 가진 가사를 통째로 붙여넣으면 <b>빈 줄 기준</b>으로 슬라이드가 자동으로 나뉘어요. (악보 없이 가사만 있어도 바로 PPT를 만들 수 있어요.)</>,
              <><b>빈 줄(엔터 두 번) = 슬라이드 나눔.</b> 한 슬라이드 안에서는 줄바꿈(엔터 한 번)만 하면 돼요.</>,
              <>줄 맨 앞에 <b># </b>=제목 슬라이드, <b>&gt; </b>=메모 슬라이드(광고·기도제목 등).</>,
              <>슬라이드 목록에서 <b>↑↓</b>로 순서를 옮기고, 한 슬라이드만 지울 수 있어요.</>,
              <>한 슬라이드가 4줄을 넘으면 빨간 표시가 떠요. 글씨 크기는 자동으로 줄어드니 걱정 안 해도 돼요.</>,
            ]}
          />
          <p style={{ margin: '12px 0 2px', fontWeight: 600, color: 'var(--ink)' }}>배경·글꼴 꾸미기 (같은 화면 오른쪽)</p>
          <List
            items={[
              <><b>무료 배경 6종</b> — 단색(검정·흰색·종이)과 실사(십자가·성경책·초원)는 누구나 써요.</>,
              <><b>배경 검색</b> — 배경이 수십 종이라 이름은 숨겨두고 검색으로 찾아요. <b>‘부활·사순·성탄·추수감사·종려·바다·십자가·빛’</b>처럼 치면 어울리는 배경이 떠요.</>,
              <><b>글꼴</b>(5종, 나눔고딕 추천)·<b>세로 정렬</b>(위·가운데·아래)을 고르면 화면과 PPT에 바로 반영돼요. 가사가 없어도 <b>‘배경 미리보기’</b>에서 미리 맞춰볼 수 있어요.</>,
            ]}
          />
          <p style={{ margin: '12px 0 2px', fontWeight: 600, color: 'var(--ink)' }}>내보내기</p>
          <List
            items={[
              <><b>전체 슬라이드 확인</b>으로 한눈에 보고, <b>PPT 다운로드</b>로 .pptx를 만들어요.</>,
              <>슬라이드 없이 글만 필요하거나 다른 도구용이면 <b>복사 · TXT · 공유 링크</b> 등으로 내보낼 수 있어요.</>,
            ]}
          />
        </Section>

        <Section title="배경 더 누리기 (프리미엄)">
          <List
            items={[
              <><b>절기·컨셉 배경 50여 종</b> — 부활절·사순절·성탄절·추수감사·종려주일 등 절기마다 어울리는 배경.</>,
              <><b>움직이는 배경 30여 종</b> — 빛내림·물결·흐르는 구름·촛불처럼 발표(슬라이드쇼) 때 살아 움직여요.</>,
              <><b>즐겨찾기</b> — 배경의 <b>금빛 왕관</b>을 누르면 북마크처럼 채워지고, 자주 쓰는 배경이 <b>목록 맨 위로</b> 고정돼요.</>,
              <><b>곡별 배경</b> — 배경 칸의 <b>[이 곡만]</b>을 켜면 한 PPT 안에서 곡마다 다른 배경을 쓸 수 있어요.</>,
              <><b>내 교회 배경 등록</b> — 사진이나 짧은 영상을 올려 우리 교회만의 배경으로 써요(영상은 움직이는 배경으로 자동 변환). 자주 쓰는 배경은 5개까지 저장돼요.</>,
              <>프리미엄 기능은 <b>금빛 왕관</b>으로 표시돼요. 누르면 요금제 안내가 떠요.</>,
            ]}
          />
        </Section>

        <Section title="저장과 로그인">
          <List
            items={[
              <><b>로그인하면</b> 곡과 콘티가 클라우드에 저장돼 다른 기기에서도 보여요.</>,
              <><b>로그인 안 하면</b> 그때그때만 쓰고, 새로고침하면 사라져요.</>,
              <><b>곡 라이브러리</b> — 로그인하면 추출한 곡이 자동으로 모여요. 제목·가사로 검색해서 다음에 바로 다시 써요.</>,
              <><b>공유 링크</b> — 콘티가 링크 자체에 담겨요. 링크를 받은 사람은 누구나 그 콘티를 볼 수 있어요. (서버에 저장되는 게 아니에요.)</>,
              <>올린 악보 사진은 가사를 뽑을 때만 AI에 보내고, 끝나면 우리 서버에 남지 않아요.</>,
            ]}
          />
        </Section>

        <Section title="자주 묻는 질문">
          <p style={{ margin: '0 0 4px' }}><b>가사가 빠지거나 이상하게 나왔어요.</b></p>
          <List
            items={[
              <>‘정확도 우선’을 켜고 다시 추출해 보세요.</>,
              <>그래도 틀리면 묶음의 ✎로 직접 고치세요.</>,
              <>아예 빠진 부분은 3단계에서 직접 입력하면 돼요.</>,
            ]}
          />
          <p style={{ margin: '12px 0 4px' }}><b>PPT를 열었더니 글씨체가 달라 보여요.</b></p>
          <p style={{ margin: 0 }}>그 컴퓨터에 같은 글꼴이 깔려 있어야 똑같이 보여요. 나눔고딕이나 본명조를 고르고 <b>글꼴 포함</b>을 켜면 글꼴이 PPT 안에 같이 담겨서 어디서든 그대로 보여요.</p>
          <p style={{ margin: '12px 0 4px' }}><b>한 슬라이드가 너무 꽉 차요.</b></p>
          <p style={{ margin: 0 }}>4줄이 넘으면 빨간 표시가 떠요. 빈 줄로 나누면 되고, 그래도 길면 글씨가 자동으로 줄어 한 화면에 담겨요.</p>
        </Section>

        <Section title="단축키">
          <List
            items={[
              <><b>Ctrl/⌘ + Enter</b> — 가사 추출하기</>,
              <><b>Ctrl/⌘ + Z</b> — 되돌리기</>,
              <><b>Ctrl/⌘ + Shift + Z</b> — 다시 실행</>,
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
