import { ImgHTMLAttributes, VideoHTMLAttributes } from 'react';
import { useSignedLessonVideoUrl } from '@/hooks/useSignedLessonVideoUrl';

type ImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined;
  fallbackSrc?: string;
};

/** <img> wrapper that signs lesson-videos URLs on the fly. Pass-through for any other URL. */
export function SignedLessonImg({ src, fallbackSrc, ...rest }: ImgProps) {
  const signed = useSignedLessonVideoUrl(src);
  if (!signed && !fallbackSrc) return null;
  return <img src={signed ?? fallbackSrc} {...rest} />;
}

type VideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src' | 'poster'> & {
  src: string | null | undefined;
  poster?: string | null;
};

/** <video> wrapper that signs lesson-videos URLs (and poster) on the fly. */
export function SignedLessonVideo({ src, poster, ...rest }: VideoProps) {
  const signedSrc = useSignedLessonVideoUrl(src);
  const signedPoster = useSignedLessonVideoUrl(poster ?? null);
  return <video src={signedSrc ?? undefined} poster={signedPoster ?? undefined} {...rest} />;
}