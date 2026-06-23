// GRAPH-xx — knowledge graph.
import { SRC } from './_src';

describe('GRAPH — knowledge graph', () => {
  const graph = () => SRC.graph();

  test('GRAPH-02 app bar has back control + title', () => {
    expect(graph()).toMatch(/goBack/);
    expect(graph()).toMatch(/headerTitle|centerTitle|Connections|Graph/);
  });

  test('GRAPH-03 center node accent fill, larger radius', () => {
    expect(graph()).toMatch(/isCenter/);
    expect(graph()).toMatch(/#7ba4ff|#5b8ef5/);
  });

  test('GRAPH-04 read vs unread node styling', () =>
    expect(graph()).toMatch(/node\.read/));

  test('GRAPH-06 edges rendered', () =>
    expect(graph()).toMatch(/<Line/));

  test('GRAPH-07 legend present', () =>
    expect(graph()).toMatch(/legend/i));

  test('GRAPH-08 node labels rendered', () =>
    expect(graph()).toMatch(/<SvgText|SvgText/));

  test('GRAPH-09 tapping a node shows a preview card before opening', () => {
    expect(graph()).toMatch(/selectNode/);
    expect(graph()).toMatch(/previewCard/);
    expect(graph()).toMatch(/Open article/);
  });

  test('GRAPH-10 canvas is pan/drag-able', () =>
    expect(graph()).toMatch(/PanResponder/));
});
