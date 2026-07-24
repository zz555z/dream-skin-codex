export function Chip({ text, kind = "" }: { text: string; kind?: string }) {
  return <span className={`chip ${kind}`.trim()}>{text}</span>;
}
