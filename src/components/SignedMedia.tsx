import { ImgHTMLAttributes, VideoHTMLAttributes } from 'react';
import { useSignedMediaUrl } from '@/hooks/useSignedMediaUrl';

type ImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null | undefined;
  fallbackSrc?: string;
};

/** <img> that signs lesson-videos OR golf-media URLs on the fly. */
export function SignedMediaImg({ src, fallbackSrc, ...rest }: ImgProps) {
  const signed = useSignedMediaUrl(src);
  if (!signed && !fallbackSrc) return null;
  return <img src={signed ?? fallbackSrc} {...rest} />;
}

type VideoProps = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src' | 'poster'> & {
  src: string | null | undefined;
  poster?: string | null;
};

/** <video> that signs lesson-videos OR golf-media URLs (and poster) on the fly. */
export function SignedMediaVideo({ src, poster, ...rest }: VideoProps) {
  const signedSrc = useSignedMediaUrl(src);
  const signedPoster = useSignedMediaUrl(poster ?? null);
  return <video src={signedSrc ?? undefined} poster={signedPoster ?? undefined} {...rest} />;
}