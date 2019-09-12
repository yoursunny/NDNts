import { Component } from "./component";

export interface NamingConventionBase {
  match(comp: Component): boolean;
}

export interface NamingConvention<T> extends NamingConventionBase {
  create(v: T): Component;
  parse(comp: Component): T;
}

export function isNamingConvention(obj) {
  return typeof obj === "object" &&
         typeof obj.match === "function" &&
         typeof obj.create === "function" &&
         typeof obj.parse === "function";
}
