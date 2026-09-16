interface LogoProps {
  inverted?: boolean;
}

export function Logo({ inverted = false }: LogoProps) {
  return (
    <span
      aria-label="VÃ‰LORA"
      style={{
        color: inverted ? "white" : "inherit",
        fontFamily: "Georgia, serif",
        letterSpacing: ".18em",
        fontWeight: 800,
      }}
    >
      VÃ‰LORA
    </span>
  );
}
