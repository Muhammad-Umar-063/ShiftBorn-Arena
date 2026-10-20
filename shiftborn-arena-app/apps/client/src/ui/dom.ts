export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function action(label: string, className = 'button'): HTMLButtonElement {
  const button = element('button', className, label);
  button.type = 'button';
  return button;
}
