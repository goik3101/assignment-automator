import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@/lib/utils";

// 기본은 면(surface)만 있는 알약 입력칸. 테두리가 필요한 폼은 className으로 border를 얹는다.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-full bg-surface px-4 text-[13px] transition-colors outline-none placeholder:text-faint focus-visible:bg-raised disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-1 aria-invalid:ring-danger",
        className
      )}
      {...props}
    />
  );
}

export { Input };
