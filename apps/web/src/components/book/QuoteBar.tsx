type QuoteBarProps = {
  quote: string;
};

export function QuoteBar({ quote }: QuoteBarProps) {
  return (
    <div className="quote-bar">
      <p className="quote-text">「{quote}」</p>
      <span className="quote-label">今日一句</span>
    </div>
  );
}
