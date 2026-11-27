"use client";
// A submit button that asks first (deletes).
import type { ComponentProps } from "react";

export function ConfirmButton({ message, ...p }: ComponentProps<"button"> & { message: string }) {
  return <button {...p} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); p.onClick?.(e); }} />;
}
