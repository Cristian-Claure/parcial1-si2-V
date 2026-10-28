import { makeStyles } from "./makeStyles";

/** Estilos comunes del móvil, derivados del tema activo (Trama o la tienda). */
export const useCommonStyles = makeStyles(({ colors }) => ({
  page: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 30,
    gap: 16,
  },
  brand: {
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0.5,
    color: colors.ink,
  },
  brandTag: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.4,
    color: colors.inkSoft,
    marginTop: 2,
  },
  eyebrow: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
    color: colors.accentDeep,
  },
  heading: {
    fontSize: 30,
    lineHeight: 36,
    fontFamily: "PlayfairDisplay_700Bold",
    color: colors.ink,
  },
  subheading: {
    fontSize: 21,
    lineHeight: 27,
    fontFamily: "PlayfairDisplay_700Bold",
    color: colors.ink,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
    color: colors.inkSoft,
  },
  muted: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
    color: colors.inkSoft,
  },
  card: {
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.paperRaised,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  label: {
    color: colors.inkSoft,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  button: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  buttonText: {
    color: colors.onAccent,
    fontFamily: "Inter_800ExtraBold",
    fontSize: 15,
    letterSpacing: 0.3,
  },
  buttonSecondary: {
    backgroundColor: colors.paperRaised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  buttonSecondaryText: {
    color: colors.ink,
  },
  buttonDanger: {
    backgroundColor: colors.error,
  },
  buttonDangerText: {
    color: colors.onSemantic,
  },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.paperRaised,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: colors.ink,
  },
  chipTextActive: {
    color: colors.onAccent,
  },
  divider: {
    height: 1,
    backgroundColor: colors.hairline,
  },
}));
