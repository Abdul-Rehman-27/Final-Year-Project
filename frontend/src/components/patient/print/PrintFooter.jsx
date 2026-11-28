/** Props: `children`, `pageCount`, and `className` configure the print footer. */
export default function PrintFooter({ children, pageCount, className = "" }) {
  return <footer className={`flex justify-between border-t border-line px-12 pb-[26px] pt-3 text-[10.5px] text-[#3F5954] ${className}`}><span>{children}</span><span>{pageCount}</span></footer>;
}
