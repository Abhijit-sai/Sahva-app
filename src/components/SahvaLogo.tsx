export default function SahvaLogo({ compact = false }: { compact?: boolean }) {
  const size = compact ? "h-8 w-auto" : "h-14 w-auto";
  return (
    <span role="img" aria-label="Sahva" className="inline-flex align-middle">
      <img alt="" width="1403" height="464" src="/logo/Sahva_logo_Whitebg.svg" className={size + (compact ? " dark:hidden" : "")} />
      {compact && <img alt="" width="1403" height="464" src="/logo/Sahva_logo_whitetext.svg" className={size + " hidden dark:block"} />}
    </span>
  );
}
