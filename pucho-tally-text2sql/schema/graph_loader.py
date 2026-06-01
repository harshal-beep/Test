"""
graph_loader.py — load the Tally schema knowledge graph and resolve joins / DDL subsets.

This is the source of truth for joins. Skeleton authors and the instantiator call
join_path() so generated SQL never invents a join, and ddl_subset() to build the
minimal schema_context for schema linking (critical for the small E2B model).
"""
import json, re
from collections import defaultdict
import networkx as nx

SQLSERVER_TO_PG = [
    (r'nvarchar\((\d+)\)', lambda m: 'text' if int(m.group(1)) > 2000 else f'varchar({m.group(1)})'),
    (r'varchar\((\d+)\)',  lambda m: f'varchar({m.group(1)})'),
    (r'decimal\((\d+),(\d+)\)', lambda m: f'numeric({m.group(1)},{m.group(2)})'),
    (r'^int$',     lambda m: 'integer'),
    (r'^tinyint$', lambda m: 'smallint'),
    (r'^date$',    lambda m: 'date'),
]

def _pg_type(t: str) -> str:
    t = t.strip()
    for pat, fn in SQLSERVER_TO_PG:
        m = re.match(pat, t)
        if m:
            return fn(m)
    return 'text'


class SchemaGraph:
    def __init__(self, path: str):
        raw = json.load(open(path))
        self.tables = {}            # name -> {cols:[...], types:[...], table_type:str}
        self.fks = []               # (from_table, from_col, to_table, to_col)
        idmap = {}
        for row in raw:
            for k in ('a', 'b'):
                n = row.get(k)
                if n and 'SchemaTable' in n.get('labels', []):
                    p = n['properties']
                    idmap[n['identity']] = p['name']
                    self.tables[p['name']] = {
                        'cols': p['columns'], 'types': p['column_types'],
                        'table_type': p.get('table_type'),
                    }
        seen = set()
        for row in raw:
            r = row.get('r')
            if r and r.get('type') == 'JOINS_ON':
                ft, tt = idmap.get(r['start']), idmap.get(r['end'])
                fc, tc = r['properties']['from_col'], r['properties']['to_col']
                key = (ft, fc, tt, tc)
                if ft and tt and key not in seen:
                    seen.add(key)
                    self.fks.append(key)
        # undirected graph of table connectivity, edge carries all join column pairs
        self.g = nx.Graph()
        self.g.add_nodes_from(self.tables)
        self._edge_cols = defaultdict(list)   # frozenset({t1,t2}) -> [(t1,c1,t2,c2), ...]
        for ft, fc, tt, tc in self.fks:
            self.g.add_edge(ft, tt)
            self._edge_cols[frozenset((ft, tt))].append((ft, fc, tt, tc))

    # ---- joins ----
    def _on_clause(self, t1, t2):
        cands = self._edge_cols.get(frozenset((t1, t2)), [])
        if not cands:
            return None
        ft, fc, tt, tc = cands[0]            # if >1, first FK; refine in skeleton if needed
        return f"{ft}.{fc} = {tt}.{tc}"

    def join_path(self, tables):
        """Given table names, return (all_tables_incl_intermediates, [ON clauses]).
        Connects the requested tables using shortest FK paths; pulls in any
        intermediate tables (e.g. trn_voucher) needed to bridge them."""
        tables = list(dict.fromkeys(tables))
        if len(tables) == 1:
            return tables, []
        needed = set(tables)
        edges = set()
        anchor = tables[0]
        for t in tables[1:]:
            try:
                path = nx.shortest_path(self.g, anchor, t)
            except nx.NetworkXNoPath:
                raise ValueError(f"No FK path between {anchor} and {t}")
            for a, b in zip(path, path[1:]):
                needed.add(a); needed.add(b); edges.add(frozenset((a, b)))
        ons = [self._on_clause(*tuple(e)) for e in edges]
        ons = [o for o in ons if o]
        return sorted(needed), ons

    # ---- schema linking ----
    def ddl_subset(self, tables):
        """Minimal CREATE TABLE DDL for just these tables (+ join hints) for schema_context."""
        tables, _ = self.join_path(tables) if len(tables) > 1 else (list(tables), [])
        out = []
        for t in tables:
            v = self.tables[t]
            lines = [f"CREATE TABLE {t} (  -- {v['table_type']}"]
            defs = []
            for c, ty in zip(v['cols'], v['types']):
                pk = ' PRIMARY KEY' if (c == 'guid' and (v['table_type'] == 'MASTER' or t == 'trn_voucher')) else ''
                defs.append(f"    {c} {_pg_type(ty)}{pk}")
            lines.append(",\n".join(defs)); lines.append(");")
            out.append("\n".join(lines))
        hints = [f"-- join: {ft}.{fc} = {tt}.{tc}"
                 for ft, fc, tt, tc in self.fks if ft in tables and tt in tables]
        return "\n\n".join(out) + ("\n\n" + "\n".join(hints) if hints else "")


if __name__ == "__main__":
    sg = SchemaGraph("schema/schema_graph.json")
    print("tables:", len(sg.tables), "fks:", len(sg.fks))
    t, ons = sg.join_path(["mst_ledger", "trn_accounting", "trn_voucher"])
    print("\njoin_path(ledger, accounting, voucher):")
    print("  tables:", t); print("  ON:", ons)
    t, ons = sg.join_path(["mst_employee", "trn_payhead"])
    print("\njoin_path(employee, payhead) [auto-bridges voucher]:")
    print("  tables:", t); print("  ON:", ons)
    print("\nddl_subset(employee, payhead):\n")
    print(sg.ddl_subset(["mst_employee", "trn_payhead"])[:600])
