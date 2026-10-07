"use client";

import { ArrowUpRight, Menu, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { sourceUrl } from "@/lib/demo";

export function Navigation() {
  return (
    <header className="site-header container">
      <a className="wordmark" href="#top" aria-label="Mentis home">
        <Network aria-hidden="true" size={25} strokeWidth={1.8} />
        <span>mentis</span>
      </a>
      <nav className="desktop-nav" aria-label="Main navigation">
        <a href="#how-it-works">How it works</a>
        <a href="#setup">Setup</a>
        <a href={sourceUrl}>
          View source <ArrowUpRight aria-hidden="true" size={14} />
        </a>
      </nav>
      <Button asChild className="pill header-cta">
        <a href="#setup">Get started</a>
      </Button>
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="phone-menu"
            aria-label="Open navigation"
          >
            <Menu aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent className="mobile-navigation">
          <SheetHeader>
            <SheetTitle>mentis</SheetTitle>
            <SheetDescription>Memory for your coding agent.</SheetDescription>
          </SheetHeader>
          <nav aria-label="Phone navigation">
            <SheetClose asChild>
              <a href="#how-it-works">How it works</a>
            </SheetClose>
            <SheetClose asChild>
              <a href="#setup">Setup</a>
            </SheetClose>
            <SheetClose asChild>
              <a href={sourceUrl}>
                View source <ArrowUpRight aria-hidden="true" size={18} />
              </a>
            </SheetClose>
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}
