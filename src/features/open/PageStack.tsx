/** Drawing for the start page: a few PDF pages being rearranged, one of them selected. */
export default function PageStack() {
  return (
    <svg className="page-stack" viewBox="0 0 420 380" aria-hidden="true">
      <g transform="rotate(-9 150 200)">
        <rect className="sheet" x="52" y="62" width="190" height="262" />
        <path className="lines" d="M76 100h142M76 122h142M76 144h96M76 190h142M76 212h118" />
      </g>
      <g transform="rotate(7 290 190)">
        <rect className="sheet" x="196" y="40" width="190" height="262" />
        <rect className="picture" x="220" y="68" width="142" height="84" />
        <path className="lines" d="M220 178h142M220 200h142M220 222h84" />
      </g>
      <g>
        <rect className="sheet selected" x="118" y="82" width="190" height="262" />
        <path className="headline" d="M142 120h104" />
        <path className="lines" d="M142 152h142M142 174h142M142 196h142M142 218h76M142 262h142M142 284h112" />
        <rect className="badge" x="286" y="60" width="44" height="44" />
        <path className="tick" d="M297 82l8 8 14-17" />
      </g>
    </svg>
  );
}
