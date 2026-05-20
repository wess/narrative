import { FileText } from "lucide-react";

// A page's icon: its chosen emoji, or a neutral document glyph.
export const PageIcon = ({ icon, size = 16 }: { icon: string; size?: number }) => {
  if (icon)
    return (
      <span className="page-icon" style={{ fontSize: size }}>
        {icon}
      </span>
    );
  return <FileText size={size} className="page-icon-default" strokeWidth={1.75} />;
};
