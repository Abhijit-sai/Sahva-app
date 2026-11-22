import type { ImgHTMLAttributes } from "react";

const assets = {
  light: ["/brand/sahva-logo-light.png", "/logo/Sahva_logo_Whitebg.svg"],
  dark: ["/brand/sahva-logo-dark.png", "/logo/Sahva_logo_whitetext.svg"],
  mark: ["/brand/sahva-mark.png", "/logo/Sahva_logo_mark.svg"],
} as const;

export default function BrandImage({
  variant = "light",
  alt = "Sahva",
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { variant?: keyof typeof assets }) {
  const [src, fallback] = assets[variant];
  return (
    <img
      {...props}
      alt={alt}
      src={src}
      onError={(event) => {
        if (event.currentTarget.getAttribute("src") !== fallback)
          event.currentTarget.src = fallback;
      }}
    />
  );
}
