import { DecoratorNode, type SerializedLexicalNode } from 'lexical'

/**
 * Horizontal rule support for the headless editor.
 */
export class HorizontalRuleNode extends DecoratorNode<null> {
  static getType(): string {
    return 'horizontalrule'
  }

  static clone(node: HorizontalRuleNode): HorizontalRuleNode {
    return new HorizontalRuleNode(node.__key)
  }

  static importJSON(): HorizontalRuleNode {
    return new HorizontalRuleNode()
  }

  exportJSON(): SerializedLexicalNode {
    return {
      type: 'horizontalrule',
      version: 1
    }
  }

  createDOM(): HTMLElement {
    return document.createElement('hr')
  }

  updateDOM(): false {
    return false
  }

  decorate(): null {
    return null
  }
}
