import Image from "next/image";

// 원본 비율: 워드마크 778x308, 아이콘(S 마크) 243x288.
const WORDMARK_RATIO = 778 / 308;
const ICON_RATIO = 243 / 288;

/**
 * studed 로고. 라이트/다크는 시스템 설정(prefers-color-scheme)에 따라 자동으로
 * 검정/흰색 워드마크를 바꿔 보여준다 (globals.css의 다크 테마와 동일한 방식).
 *
 * icon variant는 흰색 에셋이 따로 없어서 다크에서는 CSS로 반전(invert)한다 —
 * 단색 라인 로고라 실제 흰색 버전과 시각적으로 동일하게 나온다. 흰색 아이콘
 * 에셋을 받으면 wordmark처럼 별도 파일로 바꿀 것.
 */
export function Logo({
  variant = "wordmark",
  height,
  className = "",
}: {
  variant?: "wordmark" | "icon";
  height: number;
  className?: string;
}) {
  if (variant === "icon") {
    const width = Math.round(height * ICON_RATIO);
    return (
      <Image
        src="/studed_icon_black_transparent.png"
        alt="studed"
        width={width}
        height={height}
        className={`dark:invert ${className}`}
        priority
      />
    );
  }

  const width = Math.round(height * WORDMARK_RATIO);
  return (
    <>
      <Image
        src="/studed_logo_black_transparent.png"
        alt="studed"
        width={width}
        height={height}
        className={`dark:hidden ${className}`}
        priority
      />
      <Image
        src="/studed_logo_white_transparent.png"
        alt="studed"
        width={width}
        height={height}
        className={`hidden dark:block ${className}`}
        priority
      />
    </>
  );
}
