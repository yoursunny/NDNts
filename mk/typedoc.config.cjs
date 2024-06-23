const GTAG = "G-YSW3MP43Z4";

/** @type {import("typedoc").TypeDocOptions} */
module.exports = {
  entryPointStrategy: "Packages",
  out: "../docs/typedoc",
  name: "NDNts",
  readme: "./typedoc-README.md",
  customFooterHtml: `<script async src="https://www.googletagmanager.com/gtag/js?id=${GTAG}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}if(location.hostname.endsWith(".ndn.today")){gtag("js",new Date());gtag("config","${GTAG}");}</script>`,
  customFooterHtmlDisableWrapper: true,
};
