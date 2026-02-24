interface FlagImageProps {
  code: string;
  alt: string;
}

export function FlagImage({ code, alt }: FlagImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      srcSet={`https://flagcdn.com/w40/${code}.png 1x, https://flagcdn.com/w80/${code}.png 2x`}
      alt={alt}
      className="h-full w-full object-cover"
    />
  );
}
