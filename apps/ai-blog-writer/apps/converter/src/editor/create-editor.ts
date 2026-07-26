import { CodeHighlightNode, CodeNode } from '@lexical/code'
import { createHeadlessEditor } from '@lexical/headless'
import { AutoLinkNode, LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'

import { HorizontalRuleNode } from './horizontal-rule-node.js'

/**
 * Create a headless editor with every node supported by the converter.
 */
export function createEditor() {
  return createHeadlessEditor({
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      CodeNode,
      CodeHighlightNode,
      LinkNode,
      AutoLinkNode,
      HorizontalRuleNode,
      TableNode,
      TableCellNode,
      TableRowNode
    ],
    onError: (error) => {
      console.error('Lexical error:', error)
    }
  })
}
