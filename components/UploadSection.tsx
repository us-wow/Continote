'use client';

// 1번 영역 — 악보 업로드 + 정확도 토글 + 직접 가사 붙여넣기 + 추출 버튼
//
// 데이터 모델과는 독립적이라 Phase 2에서 안전하게 분리 가능.
// page.tsx 가 onDrop / onPick / removeFile / handleExtract 같은 핸들러를 주입.

import { useRef } from 'react';

type UploadSectionProps = {
  // 드래그 진행 상태 (드롭존 시각 효과용)
  dragging: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  // 파일 선택 (input.onChange)
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  // 업로드된 파일들 + 썸네일 + 한 개 제거
  files: File[];
  thumbs: string[];
  onRemoveFile: (idx: number) => void;
  // 직접 가사 붙여넣기
  pasteMode: boolean;
  setPasteMode: (next: boolean) => void;
  pasted: string;
  setPasted: (next: string) => void;
  // 추출 진행 상태
  extracting: boolean;
  loadingMsg: string;
  progressStep: number; // 1=파일준비, 2=이미지변환, 3=AI분석
  // 이미 한 번 추출했는지 — 버튼 라벨을 "다시 추출하기"로 바꾸기 위해
  hasResult: boolean;
  onExtract: () => void;
};

export default function UploadSection({
  dragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onPick,
  files,
  thumbs,
  onRemoveFile,
  pasteMode,
  setPasteMode,
  pasted,
  setPasted,
  extracting,
  loadingMsg,
  progressStep,
  hasResult,
  onExtract,
}: UploadSectionProps) {
  // hidden file input 참조 — 드롭존 클릭 시 파일 다이얼로그 열기 위해
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="stack up-panel" style={{ ['--gap' as any]: '20px' }}>
      <div>
        <div className="section-head">
          <div className="left">
            <span className="step-num-inline">01</span>
            <h2>악보 업로드</h2>
          </div>
        </div>

        <button
          type="button"
          className="dropzone"
          data-active={dragging || files.length > 0}
          aria-label="악보 파일 업로드. 클릭하거나 끌어다 놓으세요"
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            width: '100%',
            display: 'block',
            padding: '24px 24px 22px',
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={onPick}
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'none' }}
          />
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              lineHeight: 1.35,
              color: 'var(--ink)',
              letterSpacing: '-0.01em',
            }}
          >
            악보를 여기로 끌어다 놓으세요
          </div>
          <div className="caption" style={{ marginTop: 6 }}>
            또는{' '}
            <span style={{ color: 'var(--ink)', borderBottom: '1px solid var(--ink)' }}>
              파일 선택
            </span>
            <span style={{ margin: '0 8px', color: 'var(--ink-3)' }}>·</span>
            JPG · PNG · PDF
          </div>
        </button>

        {/* 썸네일 그리드 — 1개일 때도 화면 다 안 차게 minmax 80~110px */}
        {files.length > 0 && (
          <div
            style={{
              marginTop: 14,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 110px))',
              gap: 12,
              justifyContent: 'start',
            }}
          >
            {files.map((f, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <div className="thumb">
                  {thumbs[i] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbs[i]}
                      alt=""
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFile(i);
                  }}
                  title="제거"
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    border: '1px solid var(--rule)',
                    background: 'var(--paper)',
                    color: 'var(--ink-2)',
                    cursor: 'pointer',
                    fontSize: 11,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
                <div
                  className="mono"
                  style={{
                    marginTop: 6,
                    color: 'var(--ink-2)',
                    textAlign: 'left',
                    fontSize: 10.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.name}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 직접 가사 붙여넣기 기능 제거됨 — 악보 사진 추출 하나로 흐름 단일화 (혼란 줄이려고) */}

      {/* 메인 추출 버튼 + 진행 단계 표시 */}
      <div>
        <button
          className="btn-primary"
          onClick={onExtract}
          disabled={extracting || files.length === 0}
          title="가사 추출하기 (⌘+Enter)"
          style={{ width: '100%' }}
        >
          {extracting ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
              <span>{loadingMsg || '가사 추출 중'}</span>
              <span style={{ display: 'inline-flex', gap: 4 }}>
                <span className="ink-dot" style={{ background: '#fff' }} />
                <span className="ink-dot" style={{ background: '#fff' }} />
                <span className="ink-dot" style={{ background: '#fff' }} />
              </span>
            </span>
          ) : hasResult ? (
            '다시 추출하기'
          ) : (
            '가사 추출하기'
          )}
        </button>
        {extracting && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 10,
              fontSize: 11.5,
              color: 'var(--ink-3)',
            }}
          >
            {['파일 준비', '이미지 변환', 'AI 분석'].map((label, i) => {
              const stepIdx = i + 1;
              const active = progressStep === stepIdx;
              const done = progressStep > stepIdx;
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    borderRadius: 2,
                    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--rule)'),
                    background: done
                      ? 'color-mix(in oklab, var(--accent) 18%, var(--paper))'
                      : 'var(--paper)',
                    color: active || done ? 'var(--accent-ink)' : 'var(--ink-3)',
                    textAlign: 'center',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {done ? '✓ ' : ''}
                  {label}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
