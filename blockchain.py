#!/usr/bin/env python
# importing networkx  
import networkx as nx 
# importing matplotlib.pyplot 
import matplotlib.pyplot as plt
import sys

g = nx.Graph()

# g.add_edge(1, 2) 
# g.add_edge(2, 3) 
# g.add_edge(3, 4) 
# g.add_edge(1, 4) 
# g.add_edge(1, 5) 

with open(sys.argv[1], 'r') as f:
    lines = f.read().splitlines()
    for line in lines:
        (index, position, _, parent) = line.split(',')
        index = int(index)
        parent = int(parent)
        if parent == -1:
            continue
        (index_p, position_p, _, parent_p) = lines[parent].split(',') # p stands for parent
        index_p = int(index_p)
        g.add_edge(index, index_p)
  
nx.draw_spectral(g, with_labels = True) 
plt.savefig("blockchain.png") 