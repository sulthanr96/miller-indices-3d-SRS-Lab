import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
import numpy as np

fig = plt.figure()
ax = fig.add_subplot(111, projection='3d')

ax.quiver(0, 0, 0, 1, 0, 0, color='r', label='X')
ax.quiver(0, 0, 0, 0, 1, 0, color='g', label='Y')
ax.quiver(0, 0, 0, 0, 0, 1, color='b', label='Z')
ax.set_xlim([0, 1]); ax.set_ylim([0, 1]); ax.set_zlim([0, 1])

def save_view(elev, azim, name):
    ax.view_init(elev=elev, azim=azim)
    plt.savefig(name)

save_view(35, 45, 'view_45_35.png')
save_view(35, -45, 'view_-45_35.png')
save_view(35, 135, 'view_135_35.png')
save_view(35, -135, 'view_-135_35.png')
